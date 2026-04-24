/**
 * Error code constants mirrored from backend/schemas/constants.py.
 * Use these to handle specific error types in the UI.
 * @module contracts/errorCodes
 */

export const ERROR_CODES = Object.freeze({
  ERR_INVALID_CONFIG: 'ERR_INVALID_CONFIG',
  ERR_TRAINING_FAILED: 'ERR_TRAINING_FAILED',
  ERR_SESSION_NOT_FOUND: 'ERR_SESSION_NOT_FOUND',
  ERR_DATA_LOAD_FAILED: 'ERR_DATA_LOAD_FAILED',
  ERR_MODEL_BUILD_FAILED: 'ERR_MODEL_BUILD_FAILED',
  ERR_INTERNAL: 'ERR_INTERNAL',
  ERR_AUTH_REQUIRED: 'ERR_AUTH_REQUIRED',
  ERR_AUTH_INVALID: 'ERR_AUTH_INVALID',
});

/**
 * User-facing messages for each error code (Vietnamese)
 */
export const ERROR_MESSAGES_VI = Object.freeze({
  ERR_INVALID_CONFIG: 'Cấu hình không hợp lệ',
  ERR_TRAINING_FAILED: 'Huấn luyện thất bại',
  ERR_SESSION_NOT_FOUND: 'Phiên không tồn tại',
  ERR_DATA_LOAD_FAILED: 'Không thể tải dữ liệu',
  ERR_MODEL_BUILD_FAILED: 'Không thể xây dựng mô hình',
  ERR_INTERNAL: 'Lỗi hệ thống nội bộ',
  ERR_AUTH_REQUIRED: 'Cần đăng nhập',
  ERR_AUTH_INVALID: 'Thông tin xác thực không hợp lệ',
});

/**
 * Determine if an error is retriable based on its code.
 * @param {string} code - Error code
 * @returns {boolean}
 */
export function isRetriable(code) {
  const RETRIABLE_CODES = new Set([
    ERROR_CODES.ERR_TRAINING_FAILED,
    ERROR_CODES.ERR_DATA_LOAD_FAILED,
    ERROR_CODES.ERR_INTERNAL,
  ]);
  return RETRIABLE_CODES.has(code);
}

/**
 * Get user-facing error message.
 * @param {string} code - Error code
 * @param {string} [fallbackMessage] - Fallback message from server
 * @returns {string}
 */
export function getErrorMessage(code, fallbackMessage) {
  return ERROR_MESSAGES_VI[code] || fallbackMessage || 'Đã xảy ra lỗi không xác định';
}
