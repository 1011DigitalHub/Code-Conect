import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it('refuses to start without DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
  });

  it('connects on init and disconnects on destroy', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const service = new PrismaService();
    const connect = vi.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
