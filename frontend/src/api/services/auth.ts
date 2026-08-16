import { post } from '../base';
import { TokenPairDTO, RegisterResponseDTO } from '../dto';
import { LoginPayload } from '../types';

export const authService = {
  login(payload: LoginPayload): Promise<TokenPairDTO> {
    return post<TokenPairDTO>('/auth/login', payload);
  },

  register(payload: {
    username: string;
    email: string;
    full_name: string;
    password: string;
  }): Promise<RegisterResponseDTO> {
    return post<RegisterResponseDTO>('/auth/register', payload);
  },

  refresh(refreshToken: string): Promise<TokenPairDTO> {
    return post<TokenPairDTO>('/auth/refresh', { refresh_token: refreshToken });
  },

  logout(refreshToken: string): Promise<unknown> {
    return post<unknown>('/auth/logout', { refresh_token: refreshToken });
  },
};
