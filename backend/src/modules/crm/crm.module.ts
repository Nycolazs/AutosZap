import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { LeadsController } from './leads.controller';
import { PipelineStagesController } from './pipeline-stages.controller';

@Module({
  controllers: [PipelineStagesController, LeadsController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
