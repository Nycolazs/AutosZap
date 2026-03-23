import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function resolveExceptionResponse(exception: unknown): {
  status: number;
  message: string | string[];
} {
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let message: string | string[] = 'Erro interno do servidor';

  if (exception instanceof HttpException) {
    status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as { message?: string | string[] }).message ??
          message);

    return { status, message };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          'Nao foi possivel concluir a operação porque ja existe um registro com esses dados.',
      };
    }

    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Registro nao encontrado.',
      };
    }

    if (exception.code === 'P2003') {
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          'Nao foi possivel concluir a operação por causa de relacionamentos vinculados.',
      };
    }

    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Nao foi possivel concluir a operação no banco de dados.',
    };
  }

  if (exception instanceof Error) {
    return { status, message: exception.message };
  }

  return { status, message };
}
