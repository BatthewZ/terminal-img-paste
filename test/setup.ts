vi.mock('../src/util/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() })),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), show: vi.fn() },
}));
