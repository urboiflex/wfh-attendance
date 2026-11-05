import 'reflect-metadata';
import {
  BadGatewayException, BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  GatewayTimeoutException, Get, HttpCode, HttpException, Module, NotFoundException, Param, Patch, Post,
  Query, Req, Res, ServiceUnavailableException, UnauthorizedException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { randomBytes } from 'node:crypto';
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

function role(value: unknown): Role {
  if (value !== 'HR_ADMIN' && value !== 'EMPLOYEE') throw new BadRequestException('Pilih jenis akun.');
  return value;
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
  for (const [key, limit] of [[`ip:${ip}`, 60], [`email:${address}`, 12]] as const) {
    const attempt = attempts.get(key) ?? { count: 0, expires: now + 60_000 };
    if (++attempt.count > limit) throw new HttpException('Terlalu banyak percobaan. Coba lagi dalam satu menit.', 429);
    attempts.set(key, attempt);
  }
}

async function findUser(id: number) {
  const [rows] = await pool.execute<User[]>(`SELECT ${userFields} FROM users WHERE id = ?`, [id]);
  return rows[0];
}

async function findLogin(address: string) {
  const [rows] = await pool.execute<User[]>(
    `SELECT ${userFields}, password_hash AS passwordHash FROM users WHERE email = ?`, [address],
  );
  return rows[0];
}

function profile(user: User) {
  return { id: user.id, role: user.role, displayName: user.displayName, email: user.email };
}

async function authenticate(request: Request, required?: Role) {
  const token = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('wfh_session='))?.slice('wfh_session='.length);
  let claims: { sub: number; role: Role };
  try {
    if (!token) throw new Error();
    claims = jwt.verify(token, { algorithms: ['HS256'] });
  } catch {
    throw new UnauthorizedException('Silakan masuk kembali.');
  }
  const user = await findUser(claims.sub);
  if (!user?.active || user.pending || user.role !== claims.role) throw new UnauthorizedException('Silakan masuk kembali.');
  if (required && user.role !== required) throw new ForbiddenException('Akses ditolak.');
  return user;
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

  @Post('auth/login')
  @HttpCode(200)
  async login(@Req() request: Request, @Body() raw: unknown, @Res({ passthrough: true }) response: Response) {
    const body = validate(raw, ['email', 'password', 'role']);
    const address = email(body.email);
    const password = string(body.password, 'Kata sandi', 1, 128, false);
    const requestedRole = role(body.role);
    limitAttempts(request, address);
    const user = await findLogin(address);
    const verified = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
    if (!verified || !user?.active || user.pending || user.role !== requestedRole) throw new UnauthorizedException(loginError);
    response.cookie('wfh_session', jwt.sign({ sub: user.id, role: user.role }), { ...cookie, maxAge: 7_200_000 });
    return profile(user);
  }

  @Post('auth/signup')
  async signup(@Req() request: Request, @Body() raw: unknown) {
    const body = validate(raw, ['email', 'inviteCode', 'password', 'role']);
    const address = email(body.email);
    const requestedRole = role(body.role);
    const code = string(body.inviteCode, 'Kode undangan', 1, 128);
    const password = string(body.password, 'Kata sandi', 12, 128, false);
    if (password === code) throw new BadRequestException('Buat kata sandi yang berbeda dari kode undangan.');
    limitAttempts(request, address);
    const user = await findLogin(address);
    const verified = await verifyPassword(code, user?.passwordHash ?? await dummyHash);
    const invalid = 'Kode undangan atau jenis akun tidak cocok, atau akun sudah aktif.';
    if (!verified || !user?.active || !user.pending || user.role !== requestedRole) throw new UnauthorizedException(invalid);
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE users SET password_hash = ?, requires_activation = FALSE WHERE id = ? AND password_hash = ? AND requires_activation AND is_active',
      [await hashPassword(password), user.id, user.passwordHash!],
    );
    if (!result.affectedRows) throw new UnauthorizedException(invalid);
    return { message: 'Akun sudah aktif. Silakan masuk.' };
  }

  @Get('auth/me')
  async me(@Req() request: Request) {
    return profile(await authenticate(request));
  }

  @Post('auth/logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('wfh_session', cookie);
  }

  @Get('employees')
  async employees(@Req() request: Request, @Query() query: Record<string, string>) {
    await authenticate(request, 'HR_ADMIN');
    const page = query.page ? positive(query.page) : 1;
    if (page > 10000 || (query.active !== undefined && query.active !== 'true')) throw new BadRequestException();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${userFields} FROM users WHERE role = 'EMPLOYEE' ${query.active ? 'AND is_active = TRUE' : ''}
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
    const body = validate(raw, ['employeeCode', 'displayName', 'email']);
    const code = string(body.employeeCode, 'Kode karyawan', 1, 24).toUpperCase();
    const name = string(body.displayName, 'Nama', 2, 100);
    const address = email(body.email);
    const inviteCode = randomBytes(18).toString('base64url');
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users (role, employee_code, display_name, email, password_hash, requires_activation)
         VALUES ('EMPLOYEE', ?, ?, ?, ?, TRUE)`, [code, name, address, await hashPassword(inviteCode)],
      );
      return { id: result.insertId, inviteCode };
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Kode karyawan atau email sudah digunakan.');
      throw error;
    }
  }

  @Patch('employees/:id')
  async updateEmployee(@Req() request: Request, @Param('id') id: string, @Body() raw: unknown) {
    await authenticate(request, 'HR_ADMIN');
    const employeeId = positive(id);
    const body = validate(raw, ['displayName', 'email']);
    const name = string(body.displayName, 'Nama', 2, 100);
    const address = email(body.email);
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        "UPDATE users SET display_name = ?, email = ? WHERE id = ? AND role = 'EMPLOYEE'", [name, address, employeeId],
      );
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
    await authenticate(request, 'HR_ADMIN');
    const [result] = await pool.execute<ResultSetHeader>(
      "UPDATE users SET is_active = FALSE WHERE id = ? AND role = 'EMPLOYEE'", [positive(id)],
    );
    if (!result.affectedRows) throw new NotFoundException('Karyawan tidak ditemukan.');
  }

  @Get('attendance/today')
  async today(@Req() request: Request) {
    return (await attendanceRequest(await authenticate(request, 'EMPLOYEE'), '/today')).json();
  }

  @Post('attendance')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: maxPhoto, files: 1, fields: 0, parts: 2 } }))
  async checkIn(@Req() request: Request, @UploadedFile() photo?: Express.Multer.File) {
    const user = await authenticate(request, 'EMPLOYEE');
    if (!photo) throw new BadRequestException('Pilih satu foto terlebih dahulu.');
    const data = new FormData();
    data.set('photo', new Blob([new Uint8Array(photo.buffer)], { type: photo.mimetype }), 'photo');
    return (await attendanceRequest(user, '', data)).json();
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
