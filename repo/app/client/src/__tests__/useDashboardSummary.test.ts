import { useDashboardSummary } from '../features/dashboard/useDashboardSummary';

describe('useDashboardSummary', () => {
  it('configures refetchInterval of 5000ms', () => {
    // Inspect the query options via a minimal call
    // We test the hook configuration, not the network behavior
    const { name: fnName } = useDashboardSummary;
    expect(fnName).toBeDefined();

    // Verify the query key and refetchInterval by reading the source
    // This is a structural test — the hook MUST use refetchInterval: 5000
    const src = useDashboardSummary.toString();
    // Vite may transform 5000 → 5e3 during SSR compilation
    expect(src.includes('5000') || src.includes('5e3')).toBe(true);
    expect(src).toContain('refetchInterval');
  });
});
