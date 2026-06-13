import request from './request'

export function register(username: string, password: string) {
  return request.post('/auth/register', { username, password })
}

export function login(username: string, password: string) {
  return request.post('/auth/login', { username, password })
}

export function changePassword(current_password: string, new_password: string) {
  return request.post('/auth/change-password', { current_password, new_password })
}
