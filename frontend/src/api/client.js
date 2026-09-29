// Único ponto de acesso à API usado pelos componentes.
// Para trocar o mock pela API real, basta VITE_USE_MOCK=false.
import { httpApi, setUnauthorizedHandler as setHttpUnauthorized } from './http';
import { mockApi, setUnauthorizedHandler as setMockUnauthorized } from './mock/mockClient';

export const USING_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const api = USING_MOCK ? mockApi : httpApi;
export const setUnauthorizedHandler = USING_MOCK ? setMockUnauthorized : setHttpUnauthorized;
export { ApiError } from './errors';
