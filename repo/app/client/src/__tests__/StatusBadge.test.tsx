import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['PASSED', 'Passed'],
    ['FAILED', 'Failed'],
    ['CONFLICT', 'Conflict'],
    ['QUEUED', 'Queued'],
    ['RUNNING', 'Running'],
    ['CANCELLED', 'Cancelled'],
  ])('renders label for status %s', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('sets data-status attribute for CSS targeting', () => {
    render(<StatusBadge status="PASSED" />);
    expect(screen.getByText('Passed')).toHaveAttribute('data-status', 'PASSED');
  });
});
