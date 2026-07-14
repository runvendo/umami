import { nextVendoHandler } from '@vendoai/vendo/server';
import { vendo } from '@/lib/vendo';

export const { GET, POST, DELETE } = nextVendoHandler(vendo);
