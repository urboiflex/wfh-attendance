import 'reflect-metadata';
import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers,
  Module, NotFoundException, Param, PayloadTooLargeException, Post, Query, Res,
  UnsupportedMediaTypeException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import sharp from 'sharp';
import { type Actor, database, env, isDuplicate, jakartaDate, maxPhoto } from './config';
import { safeEqual } from './security';

const pool = database('attendance');
const serviceSecret = env('INTERNAL_SECRET');
const fields = 'id, employee_id AS employeeId, attendance_date AS date, submitted_at_utc AS submittedAt';
const upload = FileInterceptor('photo', { limits: { fileSize: maxPhoto, files: 1, fields: 0, parts: 2 } });

function actor(headers: Record<string, string>): Actor {
  const id = Number(headers['x-actor-id']);
  const role = headers['x-actor-role'];
  if (!safeEqual(headers['x-service-key'] ?? '', serviceSecret) ||
      !Number.isSafeInteger(id) || id <= 0 || (role !== 'HR_ADMIN' && role !== 'EMPLOYEE')) {
    throw new ForbiddenException('Akses layanan ditolak.');
  }
  return { id, role };
}

function dateValue(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}

async function normalize(photo: Express.Multer.File | undefined) {
  if (!photo) throw new BadRequestException('Pilih satu foto terlebih dahulu.');
  const image = sharp(photo.buffer, { limitInputPixels: 16_000_000, failOn: 'warning' });
  try {
    const meta = await image.metadata();
    if ((meta.format !== 'jpeg' && meta.format !== 'png') || (meta.pages ?? 1) !== 1) {
      throw new UnsupportedMediaTypeException('Gunakan satu foto JPEG atau PNG.');
    }
    const bytes = await image.rotate().toFormat(meta.format).toBuffer();
    if (bytes.length > maxPhoto) throw new PayloadTooLargeException('Ukuran foto maksimal 2 MiB.');
    return { bytes, mime: `image/${meta.format}` };
  } catch (error) {
    if (error instanceof UnsupportedMediaTypeException || error instanceof PayloadTooLargeException) throw error;
    throw new BadRequestException('Foto rusak atau melebihi 16 megapiksel.');
  }
}

@Controller('internal')
class AttendanceController {
  @Get('health')
  async health() {
    await pool.query('SELECT 1 FROM attendance LIMIT 1');
    return { status: 'ready' };
  }

  @Get('attendance/today')
  async today(@Headers() headers: Record<string, string>) {
    const current = actor(headers);
    if (current.role !== 'EMPLOYEE') throw new ForbiddenException();
    const date = jakartaDate();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${fields} FROM attendance WHERE employee_id = ? AND attendance_date = ?`, [current.id, date],
    );
    return { date, attendance: rows[0] ?? null };
  }

  @Post('attendance')
  @UseInterceptors(upload)
  async create(@Headers() headers: Record<string, string>, @UploadedFile() photo?: Express.Multer.File) {
    const current = actor(headers);
    if (current.role !== 'EMPLOYEE') throw new ForbiddenException();
    const submittedAt = new Date();
    const date = jakartaDate(submittedAt);
    const { bytes, mime } = await normalize(photo);
    try {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO attendance (employee_id, attendance_date, submitted_at_utc, evidence_mime, evidence_size, evidence_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`, [current.id, date, submittedAt, mime, bytes.length, bytes],
      );
      return { id: result.insertId, employeeId: current.id, date, submittedAt };
    } catch (error) {
      if (isDuplicate(error)) throw new ConflictException('Absensi hari ini sudah tercatat.');
      throw error;
    }
  }

  @Get('attendance')
  async list(@Headers() headers: Record<string, string>, @Query() query: Record<string, string>) {
    if (actor(headers).role !== 'HR_ADMIN') throw new ForbiddenException();
    const from = query.from ?? jakartaDate();
    const to = query.to ?? from;
    const page = Number(query.page ?? 1);
    const employeeId = query.employeeId === undefined ? null : Number(query.employeeId);
    if (!dateValue(from) || !dateValue(to) || from > to || (+new Date(to) - +new Date(from)) / 86_400_000 >= 31 ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
        (employeeId !== null && (!Number.isSafeInteger(employeeId) || employeeId < 1))) {
      throw new BadRequestException('Pilih rentang tanggal yang valid (maksimal 31 hari).');
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${fields} FROM attendance WHERE attendance_date BETWEEN ? AND ?
       ${employeeId === null ? '' : 'AND employee_id = ?'}
       ORDER BY attendance_date DESC, submitted_at_utc DESC, id DESC LIMIT 51 OFFSET ?`,
      [from, to, ...(employeeId === null ? [] : [employeeId]), (page - 1) * 50],
    );
    return { items: rows.slice(0, 50), hasNext: rows.length > 50 };
  }

  @Get('attendance/:id/evidence')
  async evidence(@Headers() headers: Record<string, string>, @Param('id') id: string, @Res() response: Response) {
    const current = actor(headers);
    if (!/^\d{1,10}$/.test(id)) throw new NotFoundException();
    const employeeOnly = current.role === 'EMPLOYEE';
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT evidence_mime, evidence_bytes FROM attendance WHERE id = ? ${employeeOnly ? 'AND employee_id = ?' : ''}`,
      employeeOnly ? [id, current.id] : [id],
    );
    if (!rows[0]) throw new NotFoundException('Bukti foto tidak ditemukan.');
    response.set({ 'Content-Type': rows[0].evidence_mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      .send(rows[0].evidence_bytes);
  }
}

@Module({ controllers: [AttendanceController] })
class AttendanceModule {}

async function start() {
  const app = await NestFactory.create(AttendanceModule);
  await app.listen(3001, '127.0.0.1');
}
void start();
