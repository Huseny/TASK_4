import { useQuery } from '@tanstack/react-query';
import { pipelineApi } from '../../lib/api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: pipelineApi.dashboard,
    refetchInterval: 5000,
  });
}
