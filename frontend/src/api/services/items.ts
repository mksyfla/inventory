import { get, post, patch, del } from '../base';
import {
  CreateItemRequestDTO,
  UpdateItemRequestDTO,
  ItemDTO,
  ItemDetailResponseDTO,
  ImportJobResponseDTO,
  CategoryDTO,
} from '../dto';

export const itemService = {
  listItems(): Promise<ItemDTO[]> {
    return get<ItemDTO[]>('/items');
  },

  getItem(id: number): Promise<ItemDetailResponseDTO> {
    return get<ItemDetailResponseDTO>(`/items/${id}`);
  },

  createItem(payload: CreateItemRequestDTO): Promise<ItemDTO> {
    return post<ItemDTO>('/items', payload);
  },

  updateItem(id: number, payload: UpdateItemRequestDTO): Promise<ItemDTO> {
    return patch<ItemDTO>(`/items/${id}`, payload);
  },

  softDeleteItem(id: number): Promise<unknown> {
    return del<unknown>(`/items/${id}`);
  },

  listCategories(): Promise<CategoryDTO[]> {
    return get<CategoryDTO[]>('/categories');
  },

  importItems(file: File): Promise<ImportJobResponseDTO> {
    const formData = new FormData();
    formData.append('file', file);
    return post<ImportJobResponseDTO>('/items/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
