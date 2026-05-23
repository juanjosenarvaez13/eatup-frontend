import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ENV } from '@config/env.config';
import {
  CreateProviderRequest,
  Provider,
  ProviderStatus,
  UpdateProviderRequest,
  UpdateProviderStatusRequest,
} from '@commercial/provider/models/provider.model';

@Injectable({ providedIn: 'root' })
export class ProvidersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${ENV.apiUrl}/commercial/api/v1/providers`;

  getProviders(status?: ProviderStatus): Observable<Provider[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;

    return this.http
      .get<unknown>(this.baseUrl, params ? { params } : undefined)
      .pipe(map((response) => this.normalizeList(response)));
  }

  getProviderById(id: string): Observable<Provider> {
    return this.http.get<Provider>(`${this.baseUrl}/${id}`);
  }

  createProvider(payload: CreateProviderRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.baseUrl, payload);
  }

  updateProvider(id: string, payload: UpdateProviderRequest): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/${id}`, payload);
  }

  updateStatus(id: string, status: ProviderStatus): Observable<{ message: string }> {
    const payload: UpdateProviderStatusRequest = { status };
    return this.http.patch<{ message: string }>(`${this.baseUrl}/${id}/status`, payload);
  }

  private normalizeList(response: unknown): Provider[] {
    if (Array.isArray(response)) {
      return response as Provider[];
    }

    if (!this.isRecord(response)) {
      return [];
    }

    const candidates = [response['content'], response['data'], response['providers']];
    const list = candidates.find(Array.isArray);

    return Array.isArray(list) ? (list as Provider[]) : [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
