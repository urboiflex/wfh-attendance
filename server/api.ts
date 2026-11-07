import 'reflect-metadata';
import {
  BadGatewayException, BadRequestException, Body, type CanActivate, ConflictException, Controller, Delete, type ExecutionContext, ForbiddenException,
  GatewayTimeoutException, Get, HttpCode, HttpException, Module, NotFoundException, Param, Patch, Post,
  Query, Req, Res, ServiceUnavailableException, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { type Actor, type Role, attendanceOrigin, database, env, isDuplicate, maxPhoto } from './config';
import { hashPassword, verifyPassword } from './security';

const pool = database('api');
const publicOrigin = env('PUBLIC_ORIGIN');
const jwt = new JwtService({ secret: env('SESSION_SECRET'), signOptions: { expiresIn: '2h', algorithm: 'HS256' } });
const cookie = { httpOnly: true, secure: publicOrigin.startsWith('https:'), sameSite: 'lax' as const, path: '/api' };
const userFields = 'id, role, display_name AS displayName, email, employee_code AS employeeCode, is_active AS active, requires_activation AS pending';
const loginError = 'Email, kata sandi, atau jenis akun tidak cocok.';
const attempts = new Map<string, { count: number; expires: number }>();
const dummyHash = hashPassword(randomBytes(32).toString('hex'));

interface User extends RowDataPacket, Actor {
  displayName: string;
  email: string;
  active: number;
  pending: number;
  passwordHash?: string;
  sessionVersion?: number;
}

function validate(body: unknown, keys: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) {
    throw new BadRequestException('Periksa data yang dikirim.');
  }
  return body as Record<string, unknown>;
}

function string(value: unknown, name: string, min: number, max: number, trim = true): string {
  const input = typeof value === 'string' ? (trim ? value.trim() : value) : '';
  if (input.length < min || input.length > max) throw new BadRequestException(`${name} harus berisi ${min}–${max} karakter.`);
  return input;
}

function email(value: unknown): string {
  const input = string(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) throw new BadRequestException('Masukkan email yang valid.');
  return input;
}

function positive(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4_294_967_295) throw new BadRequestException('ID tidak valid.');
  return parsed;
}

function limitAttempts(request: Request, address: string) {
  const now = Date.now();
  for (const [key, attempt] of attempts) if (attempt.expires <= now) attempts.delete(key);
  const ip = request.ip ?? 'local';
  const ipKey = `ip:${ip}`;
  const emailKey = `email:${address}`;
  function charge(key: string, limit: number) {
    const attempt = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
    if (attempt.count >= limit) throw new HttpException('Terlalu banyak percobaan. Coba lagi dalam satu menit.', 429);
    attempt.count++;
    attempts.set(key, attempt);
    return attempt;
  }
  const ipAttempt = charge(ipKey, 60);
  const emailAttempt = charge(emailKey, 12);
  return () => {
    if (attempts.get(ipKey) === ipAttempt) ipAttempt.count--;
    if (attempts.get(emailKey) === emailAttempt) attempts.delete(emailKey);
  };
}

async function findUser(id: number) {
  const [rows] = await pool.execute<User[]>(`SELECT ${userFields} FROM users WHERE id = ?`, [id]);
  return rows[0];
}

async function findLogin(address: string) {
  const [rows] = await pool.execute<User[]>(
    `SELECT ${userFields}, password_hash AS passwordHash, session_version AS sessionVersion FROM users WHERE email = ?`, [address],
  );
  const user = rows[0];
  return user?.email.toLowerCase() === address ? user : undefined;
}

async function createAccount(body: Record<string, unknown>, role: Role, employeeCode: string | null) {
  const name = string(body.displayName, 'Nama', 2, 100);
  const address = email(body.email);
  const password = string(body.password, 'Kata sandi awal', 12, 128, false);
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (role, employee_code, display_name, email, password_hash) VALUES (?, ?, ?, ?, ?)`,
      [role, employeeCode, name, address, await hashPassword(password)],
    );
    return { id: result.insertId };
  } catch (error) {
    if (isDuplicate(error)) {
      throw new ConflictException(employeeCode === null ? 'Email sudah digunakan.' : 'Kode karyawan atau email sudah digunakan.');
    }
    throw error;
  }
}

function profile(user: User) {
  return { id: user.id, role: user.role, displayName: user.displayName, email: user.email };
}

function session(request: Request) {
  const token = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('wfh_session='))?.slice('wfh_session='.length);
  if (!token) return;
  try {
    const claims = jwt.verify<{ sub: number; role: Role; exp: number; version?: number }>(token, { algorithms: ['HS256'] });
    return { ...claims, digest: createHash('sha256').update(token).digest() };
  } catch {
    return;
  }
}

async function authenticate(request: Request, required?: Role) {
  const claims = session(request);
  if (!claims) throw new UnauthorizedException('Silakan masuk kembali.');
  const [rows] = await pool.execute<User[]>(
    `SELECT ${userFields} FROM users WHERE id = ? AND session_version = ?
     AND NOT EXISTS (SELECT 1 FROM revoked_sessions WHERE token_hash = ?)`, [claims.sub, claims.version ?? 0, claims.digest],
  );
  const user = rows[0];
  if (!user?.active || user.pending || user.role !== claims.role) throw new UnauthorizedException('Silakan masuk kembali.');
  if (required && user.role !== required) throw new ForbiddenException('Akses ditolak.');
  return user;
}

type CheckInRequest = Request & { attendanceActor: Actor };

class EmployeeUploadGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CheckInRequest>();
    request.attendanceActor = await authenticate(request, 'EMPLOYEE');
    return true;
  }
}

async function attendanceRequest(user: Actor, path: string, body?: FormData) {
  let response: globalThis.Response;
  try {
    response = await fetch(`${attendanceOrigin}/internal/attendance${path}`, {
      method: body ? 'POST' : 'GET',
      body,
      headers: {
        'x-service-key': env('INTERNAL_SECRET'),
        'x-actor-id': String(user.id),
        'x-actor-role': user.role,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new GatewayTimeoutException('Konfirmasi absensi belum diterima.');
    throw new ServiceUnavailableException('Layanan absensi sedang tidak tersedia.');
  }
  if (response.ok) return response;
  const details = await response.json().catch(() => null);
  if (response.status < 500 && typeof details?.message === 'string') {
    throw new HttpException(details.message, response.status);
  }
  throw new BadGatewayException('Layanan absensi gagal memproses permintaan.');
}

@Controller()
class ApiController {
  @Get('health')
  async health() {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    return { status: 'ready' };
  }

  @Post('auth/:portal/login')
  @HttpCode(200)
  async login(@Param('portal') portal: string, @Req() request: Request, @Body() raw: unknown, @Res({ passthrough: true }) response: Response) {
    if (portal !== 'karyawan' && portal !== 'admin') throw new NotFoundException();
    const requestedRole = portal === 'admin' ? 'HR_ADMIN' : 'EMPLOYEE';
    const body = validate(raw, ['email', 'password']);
    const address = email(body.email);
    const password = string(body.password, 'Kata sandi', 8, 128, false);
    const recordSuccess = limitAttempts(request, address);
    const user = await findLogin(address);
    const verified = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
    if (!verified || !user || user.role !== requestedRole) throw new UnauthorizedException(loginError);
    recordSuccess();
    if (!user.active && user.role === 'EMPLOYEE') {
      throw new ForbiddenException('Akun Anda dinonaktifkan sementara. Hubungi Admin HR untuk mengaktifkan kembali akun Anda.');
    }
    if (!user.active || user.pending) throw new UnauthorizedException(loginError);
    response.cookie('wfh_session', jwt.sign({ sub: user.id, role: user.role, version: user.sessionVersion }, { jwtid: randomUUID() }),
      { ...cookie, maxAge: 7_200_000 });
    return profile(user);
  }

  @Get('auth/me')
  async me(@Req() request: Request) {
    return profile(await authenticate(request));
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const claims = session(request);
    if (claims) {
      await pool.execute(
        `INSERT INTO revoked_sessions (token_hash, expires_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE token_hash = token_hash`,
        [claims.digest, new Date(claims.exp * 1000)],
      );
      await pool.execute('DELETE FROM revoked_sessions WHERE expires_at <= UTC_TIMESTAMP()');
    }
    response.clearCookie('wfh_session', cookie);
  }

  @Get('employees')
  async employees(@Req() request: Request, @Query() query: Record<string, string>) {
    await authenticate(request, 'HR_ADMIN');
    const page = query.page ? positive(query.page) : 1;
    if (page > 10000 || (query.active !== undefined && query.active !== 'true')) throw new BadRequestException();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${userFields} FROM users WHERE role = 'EMPLOYEE' ${query.active ? 'AND is_active = TRUE AND requires_activation = FALSE' : ''}
       ORDER BY id DESC LIMIT 51 OFFSET ?`, [(page - 1) * 50],
    );
    return { items: rows.slice(0, 50), hasNext: rows.length > 50 };
  }

  @Get('employees/:id')
  async employee(@Req() request: Request, @Param('id') id: string) {
    await authenticate(request, 'HR_ADMIN');
    const user = await findUser(positive(id));
    if (user?.role !== 'EMPLOYEE') throw new NotFoundException('Karyawan tidak ditemukan.');
    return user;
  }

  @Post('employees')
  async createEmployee(@Req() request: Request, @Body() raw: unknown) {
    await authenticate(request, 'HR_ADMIN');
    const body = validate(raw, ['employeeCode', 'displayName', 'email', 'password']);
    const code = string(body.employeeCode, 'Kode karyawan', 1, 24).toUpperCase();
    return createAccount(body, 'EMPLOYEE', code);
  }

  @Post('admins')
  async createAdmin(@Req() request: Request, @Body() raw: unknown) {
    await authenticate(request, 'HR_ADMIN');
    return createAccount(validate(raw, ['displayName', 'email', 'password']), 'HR_ADMIN', null);
  }

  @Patch('employees/:id')
  async updateEmployee(@Req() request: Request, @Param('id') id: string, @Body() raw: unknown) {
    await authenticate(request, 'HR_ADMIN');
    const employeeId = positive(id);
    const body = validate(raw, ['displayName', 'email', 'initialPassword']);
    const name = string(body.displayName, 'Nama', 2, 100);
    const address = email(body.email);
    try {
      const [result] = body.initialPassword === undefined
        ? await pool.execute<ResultSetHeader>(
          "UPDATE users SET display_name = ?, email = ? WHERE id = ? AND role = 'EMPLOYEE'", [name, address, employeeId],
        )
        : await pool.execute<ResultSetHeader>(
          `UPDATE users SET display_name = ?, email = ?, password_hash = ?, requires_activation = FALSE
           WHERE id = ? AND role = 'EMPLOYEE' AND is_active = TRUE AND requires_activation = TRUE`,
          [name, address, await hashPassword(string(body.initialPassword, 'Kata sandi awal', 12, 128, false)), employeeId],
        );
      if (!result.affectedRows && body.initialPassword !== undefined && (await findUser(employeeId))?.role === 'EMPLOYEE') {
        throw new ConflictException('Akun ini sudah memiliki kata sandi atau tidak aktif.');
      }
      if (!result.affectedRows) throw new NotFoundException('Karyawan tidak ditemukan.');
      return findUser(employeeId);
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Email sudah digunakan.');
      throw error;
    }
  }

  @Delete('employees/:id')
  @HttpCode(204)
  async deactivate(@Req() request: Request, @Param('id') id: string) {
    await this.setEmployeeActive(request, id, false);
  }

  @Post('employees/:id/reactivate')
  @HttpCode(204)
  async reactivate(@Req() request: Request, @Param('id') id: string) {
    await this.setEmployeeActive(request, id, true);
  }

  private async setEmployeeActive(request: Request, id: string, active: boolean) {
    await authenticate(request, 'HR_ADMIN');
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE users SET session_version = session_version + IF(is_active <> ?, 1, 0), is_active = ?
       WHERE id = ? AND role = 'EMPLOYEE'`, [active, active, positive(id)],
    );
    if (!result.affectedRows) throw new NotFoundException('Karyawan tidak ditemukan.');
  }

  @Get('attendance/today')
  async today(@Req() request: Request) {
    return (await attendanceRequest(await authenticate(request, 'EMPLOYEE'), '/today')).json();
  }

  @Post('attendance')
  @UseGuards(EmployeeUploadGuard)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: maxPhoto, files: 1, fields: 0, parts: 2 } }))
  async checkIn(@Req() request: CheckInRequest, @UploadedFile() photo?: Express.Multer.File) {
    if (!photo?.buffer.length) throw new BadRequestException('Pilih satu foto terlebih dahulu.');
    const data = new FormData();
    data.set('photo', new Blob([new Uint8Array(photo.buffer)], { type: photo.mimetype }), 'photo');
    return (await attendanceRequest(request.attendanceActor, '', data)).json();
  }

  @Get('attendance')
  async attendance(@Req() request: Request, @Query() query: Record<string, string>) {
    const user = await authenticate(request, 'HR_ADMIN');
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'employeeId', 'page']) {
      if (query[key] !== undefined) {
        if (typeof query[key] !== 'string') throw new BadRequestException('Filter tidak valid.');
        params.set(key, query[key]);
      }
    }
    const result = await (await attendanceRequest(user, `?${params}`)).json() as {
      items: Array<{ employeeId: number }>; hasNext: boolean;
    };
    const ids = [...new Set(result.items.map((item) => item.employeeId))];
    const [rows] = ids.length ? await pool.query<RowDataPacket[]>(
      'SELECT id, display_name AS displayName, employee_code AS employeeCode FROM users WHERE id IN (?)', [ids],
    ) : [[]];
    const names = new Map(rows.map((row) => [row.id, row]));
    return { ...result, items: result.items.map((item) => ({ ...item, employee: names.get(item.employeeId) })) };
  }

  @Get('attendance/:id/evidence')
  async evidence(@Req() request: Request, @Param('id') id: string, @Res() response: Response) {
    const upstream = await attendanceRequest(await authenticate(request), `/${positive(id)}/evidence`);
    response.set({
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(Buffer.from(await upstream.arrayBuffer()));
  }
}

@Module({ controllers: [ApiController] })
class ApiModule {}

async function start() {
  const app = await NestFactory.create(ApiModule);
  app.setGlobalPrefix('api');
  app.use((request: Request, response: Response, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== publicOrigin) {
      response.status(403).json({ message: 'Akses lintas situs ditolak.' });
      return;
    }
    next();
  });
  await app.listen(3000, '127.0.0.1');
}
void start();
