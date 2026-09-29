export class ApiError extends Error {
  constructor(status, detail, data = null) {
    super(detail || `Erro ${status}`);
    this.name = 'ApiError';
    this.status = status; // 0 = sem conexão
    this.detail = detail || '';
    this.data = data;
  }
}
