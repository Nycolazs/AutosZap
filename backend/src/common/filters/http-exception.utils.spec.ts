import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveExceptionResponse } from './http-exception.utils';

describe('resolveExceptionResponse', () => {
  it('preserves regular HTTP exceptions', () => {
    expect(
      resolveExceptionResponse(new NotFoundException('Nao encontrado.')),
    ).toEqual({
      status: 404,
      message: 'Nao encontrado.',
    });
  });

  it('maps unique constraint violations to a safe message', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(resolveExceptionResponse(error)).toEqual({
      status: 400,
      message:
        'Nao foi possivel concluir a operação porque ja existe um registro com esses dados.',
    });
  });

  it('maps missing database records to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });

    expect(resolveExceptionResponse(error)).toEqual({
      status: 404,
      message: 'Registro nao encontrado.',
    });
  });

  it('preserves generic Error messages', () => {
    expect(resolveExceptionResponse(new Error('Falha inesperada.'))).toEqual({
      status: 500,
      message: 'Falha inesperada.',
    });
  });

  it('preserves bad request payload messages', () => {
    expect(
      resolveExceptionResponse(new BadRequestException(['Campo A', 'Campo B'])),
    ).toEqual({
      status: 400,
      message: ['Campo A', 'Campo B'],
    });
  });
});
