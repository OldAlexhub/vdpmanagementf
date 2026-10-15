import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompassPerformanceCard from './CompassPerformanceCard';
import { api } from '../api';
import { useAuth } from '../App';

jest.mock('../App', () => ({ useAuth: jest.fn() }));
jest.mock('../api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));

const snapshot = () => ({
  available: true, importId: 'snapshot1', revision: 3, loaded: true, refreshing: false, locked: false,
  lastSyncedAt: '2026-09-15T12:00:00Z', lastError: null, totals: { trips: '10', serviceHours: '8' },
  coverage: [{ divisionId: 'd6', divisionNumber: '6', dates: ['2026-09-01'], missingDates: [] }],
  missingMetrics: [], unresolvedCount: 0, conflictCount: 0, correctionHistory: [],
  rows: [{ rowKey: 'row1', divisionId: 'd6', date: '2026-09-01', route: '600', providerId: 'p1', providerName: 'Test Provider', operatorId: 'o1', operatorName: 'Driver One', source: 'vision', trips: '10', serviceHours: '8', original: { trips: '10', serviceHours: '8' } }],
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'ACCOUNTING' } });
  api.get.mockImplementation((path) => Promise.resolve(path === '/providers'
    ? [{ _id: 'p1', divisionId: 'd6', name: 'Test Provider', operators: [{ id: 'o1', name: 'Driver One', status: 'ACTIVE' }] }]
    : snapshot()));
});

test('Accounting corrects only the changed value with a required reason and current revision', async () => {
  const changed = jest.fn();
  api.post.mockResolvedValue(snapshot());
  render(<CompassPerformanceCard cycleId="cycle1" revision={3} onChanged={changed} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Correct' }));
  expect(screen.getByRole('button', { name: 'Save with reason' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Corrected service hours'), { target: { value: '9.5' } });
  fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Verified duty correction' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save with reason' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cycles/cycle1/compass-performance/corrections', {
    rowKey: 'row1', action: 'CORRECT', expectedRevision: 3, values: { serviceHours: '9.5' }, reason: 'Verified duty correction',
  }));
  expect(changed).toHaveBeenCalled();
});

test('assignment correction uses the operator ID returned by the provider endpoint', async () => {
  api.post.mockResolvedValue(snapshot());
  render(<CompassPerformanceCard cycleId="cycle1" revision={3} onChanged={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Correct' }));
  fireEvent.change(screen.getByLabelText('Correction provider'), { target: { value: 'p1' } });
  fireEvent.change(screen.getByLabelText('Correction operator'), { target: { value: 'o1' } });
  fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Verified assigned driver' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save with reason' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ assignment: { providerId: 'p1', operatorId: 'o1' } })));
});

test('NSM can inspect but cannot correct or refresh', async () => {
  useAuth.mockReturnValue({ user: { role: 'NSM' } });
  render(<CompassPerformanceCard cycleId="cycle1" revision={3} onChanged={() => {}} />);
  await screen.findByText('Driver One');
  expect(screen.queryByRole('button', { name: 'Correct' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refresh from Compass' })).not.toBeInTheDocument();
});

test('a concurrent edit closes the stale form and requires reviewing the latest record', async () => {
  api.post.mockRejectedValue(Object.assign(new Error('Performance changed. Refresh and try again.'), { status: 409 }));
  render(<CompassPerformanceCard cycleId="cycle1" revision={3} onChanged={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Correct' }));
  fireEvent.change(screen.getByLabelText('Corrected service hours'), { target: { value: '9.5' } });
  fireEvent.change(screen.getByLabelText('Correction reason'), { target: { value: 'Verified duty correction' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save with reason' }));
  await screen.findByText('Performance changed. Refresh and try again.');
  expect(screen.queryByLabelText('Corrected service hours')).not.toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(1);
});

test('refresh failures stay visible and correction conflicts offer explicit retain and revert', async () => {
  const data = snapshot();
  data.lastError = 'Compass unavailable'; data.conflictCount = 1;
  data.rows[0].conflict = true; data.rows[0].correction = { values: { serviceHours: '9' }, reason: 'Approved correction' };
  api.get.mockImplementation((path) => Promise.resolve(path === '/providers' ? [] : data));
  render(<CompassPerformanceCard cycleId="cycle1" revision={3} onChanged={() => {}} />);
  expect(await screen.findByText(/Compass refresh failed/)).toHaveTextContent('previous snapshot is retained');
  expect(screen.getByRole('button', { name: 'Keep correction' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revert' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep correction' }));
  expect(screen.getByRole('button', { name: 'Save with reason' })).toBeDisabled();
});
