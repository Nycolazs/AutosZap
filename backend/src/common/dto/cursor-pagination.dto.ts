import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CursorPaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 30))
  @IsInt()
  @Min(1)
  @Max(80)
  limit = 30;

  @IsOptional()
  @IsIn(['before', 'after'])
  direction: 'before' | 'after' = 'before';
}
