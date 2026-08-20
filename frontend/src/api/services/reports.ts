import { get } from '../base';
import {
  DashboardSummaryDTO,
  FsnReportDTO,
  SpaceUtilizationDTO,
  ValuationReportDTO,
} from '../dto';

export const reportService = {
  fsn(): Promise<FsnReportDTO[]> {
    return get<FsnReportDTO[]>('/reports/fsn');
  },

  valuation(): Promise<ValuationReportDTO[]> {
    return get<ValuationReportDTO[]>('/reports/valuation');
  },

  spaceUtilization(): Promise<SpaceUtilizationDTO[]> {
    return get<SpaceUtilizationDTO[]>('/reports/space-utilization');
  },

  dashboardSummary(): Promise<DashboardSummaryDTO> {
    return get<DashboardSummaryDTO>('/dashboard/summary');
  },
};
