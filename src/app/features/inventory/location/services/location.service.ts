import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '@core/services/environment.service';
import { Observable } from 'rxjs';
import {
  LocationPatchRequest,
  LocationRequest,
  LocationResponse
} from '../models/location.model';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly apiRoot: string;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly env: EnvironmentService
  ) {
    this.apiRoot = this.env.apiUrl.replace(/\/api\/v1\/?$/, '');
    this.baseUrl = `${this.apiRoot}/inventory/api/v1/location`;
  }

  list(): Observable<LocationResponse[]> {
    return this.http.get<LocationResponse[]>(this.baseUrl);
  }

  listActive(): Observable<LocationResponse[]> {
    return this.http.get<LocationResponse[]>(`${this.baseUrl}/active`);
  }

  getById(id: string): Observable<LocationResponse> {
    return this.http.get<LocationResponse>(`${this.baseUrl}/${id}`);
  }

  create(request: LocationRequest): Observable<unknown> {
    return this.http.post(this.baseUrl, request);
  }

  update(id: string, request: LocationRequest): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/${id}`, request);
  }

  updateStatus(id: string, request: LocationPatchRequest): Observable<unknown> {
    return this.http.patch(`${this.baseUrl}/editar/${id}`, request);
  }
}