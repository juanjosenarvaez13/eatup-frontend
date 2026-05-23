import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Observable, finalize, switchMap } from 'rxjs';

import { ENV } from '@config/env.config';
import { ProviderStatusBadgeComponent } from '@commercial/provider/components/provider-status-badge/provider-status-badge.component';
import {
  CatalogOption,
  CityOption,
  CreateProviderRequest,
  Provider,
  ProviderStatus,
  UpdateProviderRequest,
} from '@commercial/provider/models/provider.model';
import { ProviderFilterPipe } from '@commercial/provider/pipes/provider-filter.pipe';
import { ProvidersService } from '@commercial/provider/services/provider.service';

type ProviderFormMode = 'create' | 'edit';
type ProviderToastType = 'success' | 'error';
type StatusFilter = 'ALL' | ProviderStatus;

type ProviderFormControlName =
  | 'businessName'
  | 'documentTypeId'
  | 'documentNumber'
  | 'taxRegimeId'
  | 'responsibleFirstName'
  | 'responsibleLastName'
  | 'phone'
  | 'email'
  | 'departmentId'
  | 'cityId'
  | 'address'
  | 'status';

interface ProviderFormValue {
  businessName: string;
  documentTypeId: string;
  documentNumber: string;
  taxRegimeId: string;
  responsibleFirstName: string;
  responsibleLastName: string;
  phone: string;
  email: string;
  departmentId: string;
  cityId: string;
  address: string;
  branchId: string;
  status: ProviderStatus;
}

interface ProviderToast {
  type: ProviderToastType;
  message: string;
}

@Component({
  selector: 'app-provider-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ProviderStatusBadgeComponent],
  templateUrl: './provider-list.component.html',
  styleUrl: './provider-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProviderListComponent implements OnInit, OnDestroy {
  private readonly providerService = inject(ProvidersService);
  private readonly fb = new FormBuilder().nonNullable;
  private readonly filterPipe = new ProviderFilterPipe();
  private readonly providerStatuses: readonly ProviderStatus[] = ['ACTIVE', 'INACTIVE'];
  private readonly lettersPattern = /^[\p{L}\s]+$/u;

  protected readonly documentTypes: CatalogOption[] = [
    { id: '1', label: 'NIT', shortLabel: 'NIT' },
    { id: '2', label: 'Cédula de ciudadanía', shortLabel: 'CC' },
    { id: '3', label: 'Cédula de extranjería', shortLabel: 'CE' },
    { id: '4', label: 'Pasaporte', shortLabel: 'PP' },
  ];

  protected readonly taxRegimes: CatalogOption[] = [
    { id: '1', label: 'Régimen común' },
    { id: '2', label: 'Régimen simplificado' },
    { id: '3', label: 'No responsable de IVA' },
  ];

  protected readonly departments: CatalogOption[] = [
    { id: '11', label: 'Bogotá D.C.' },
    { id: '5', label: 'Antioquia' },
    { id: '76', label: 'Valle del Cauca' },
    { id: '8', label: 'Atlántico' },
  ];

  protected readonly cities: CityOption[] = [
    { id: '11001', label: 'Bogotá', departmentId: '11' },
    { id: '5001', label: 'Medellín', departmentId: '5' },
    { id: '76001', label: 'Cali', departmentId: '76' },
    { id: '8001', label: 'Barranquilla', departmentId: '8' },
  ];

  protected readonly providers = signal<Provider[]>([]);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('ALL');
  protected readonly drawerOpen = signal(false);
  protected readonly formMode = signal<ProviderFormMode>('create');
  protected readonly selectedProvider = signal<Provider | null>(null);
  protected readonly saving = signal(false);
  protected readonly formSubmitted = signal(false);
  protected readonly changingStatus = signal<string | null>(null);
  protected readonly toast = signal<ProviderToast | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly pageSize = 8;

  protected readonly totalProviders = computed(() => this.providers().length);
  protected readonly activeProviders = computed(
    () => this.providers().filter((p) => this.statusOf(p) === 'ACTIVE').length,
  );
  protected readonly inactiveProviders = computed(
    () => this.providers().filter((p) => this.statusOf(p) === 'INACTIVE').length,
  );

  protected readonly filteredProviders = computed(() => {
    let list = this.filterPipe.transform(this.providers(), this.search());

    const filter = this.statusFilter();
    if (filter !== 'ALL') {
      list = list.filter((p) => this.statusOf(p) === filter);
    }

    return list;
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredProviders().length / this.pageSize)),
  );

  protected readonly paginatedProviders = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredProviders().slice(start, start + this.pageSize);
  });

  protected readonly availableCities = computed(() => {
    const departmentId = this.form.controls.departmentId.value;
    if (!departmentId) {
      return this.cities;
    }
    return this.cities.filter((city) => city.departmentId === departmentId);
  });

  protected readonly form = this.fb.group({
    businessName: ['', [Validators.required, Validators.maxLength(150)]],
    documentTypeId: ['', Validators.required],
    documentNumber: ['', [Validators.required, Validators.pattern(/^\d{6,20}$/)]],
    taxRegimeId: ['', Validators.required],
    responsibleFirstName: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(this.lettersPattern)],
    ],
    responsibleLastName: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(this.lettersPattern)],
    ],
    phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    email: ['', [Validators.required, Validators.email]],
    departmentId: ['', Validators.required],
    cityId: ['', Validators.required],
    address: ['', [Validators.required, Validators.maxLength(200)]],
    branchId: [ENV.locationId, Validators.required],
    status: ['ACTIVE' as ProviderStatus, [Validators.required, this.statusValidator.bind(this)]],
  });

  ngOnInit(): void {
    this.loadProviders();
    this.form.controls.departmentId.valueChanges.subscribe((departmentId) => {
      const cityId = this.form.controls.cityId.value;
      const stillValid = this.cities.some(
        (city) => city.id === cityId && city.departmentId === departmentId,
      );
      if (!stillValid) {
        this.form.controls.cityId.setValue('');
      }
    });
  }

  ngOnDestroy(): void {
    this.clearToastTimer();
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  protected setStatusFilter(filter: StatusFilter): void {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
  }

  protected goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  protected openCreate(): void {
    this.formMode.set('create');
    this.selectedProvider.set(null);
    this.formSubmitted.set(false);
    this.form.controls.email.enable();
    this.form.reset({
      businessName: '',
      documentTypeId: '',
      documentNumber: '',
      taxRegimeId: '',
      responsibleFirstName: '',
      responsibleLastName: '',
      phone: '',
      email: '',
      departmentId: '',
      cityId: '',
      address: '',
      branchId: ENV.locationId,
      status: 'ACTIVE',
    });
    this.drawerOpen.set(true);
  }

  protected openEdit(provider: Provider): void {
    this.formMode.set('edit');
    this.selectedProvider.set(provider);
    this.formSubmitted.set(false);
    this.form.reset({
      businessName: provider.businessName ?? '',
      documentTypeId: String(provider.documentTypeId ?? ''),
      documentNumber: provider.documentNumber ?? '',
      taxRegimeId: String(provider.taxRegimeId ?? ''),
      responsibleFirstName: provider.responsibleFirstName ?? '',
      responsibleLastName: provider.responsibleLastName ?? '',
      phone: provider.phone ?? '',
      email: provider.email ?? '',
      departmentId: String(provider.departmentId ?? ''),
      cityId: String(provider.cityId ?? ''),
      address: provider.address ?? '',
      branchId: provider.branchId || ENV.locationId,
      status: this.statusOf(provider),
    });
    this.form.controls.email.disable();
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    if (this.saving()) {
      return;
    }

    this.drawerOpen.set(false);
    this.selectedProvider.set(null);
    this.formSubmitted.set(false);
    this.form.controls.email.enable();
  }

  protected saveProvider(): void {
    this.formSubmitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue() as ProviderFormValue;

    if (!raw.branchId.trim()) {
      this.showToast('error', 'No hay una sede configurada para registrar el proveedor');
      return;
    }

    const isCreating = this.formMode() === 'create';
    const request$ = isCreating
      ? this.providerService.createProvider(this.buildCreatePayload(raw))
      : this.updateCurrentProvider(raw);

    if (!request$) {
      return;
    }

    this.saving.set(true);
    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.closeDrawerAfterSave();
          this.showToast(
            'success',
            isCreating ? 'Proveedor creado correctamente' : 'Proveedor actualizado correctamente',
          );
          this.loadProviders({ showLoading: false });
        },
        error: () => this.showToast('error', 'No se pudo guardar el proveedor'),
      });
  }

  protected toggleStatus(provider: Provider): void {
    if (!provider.id || this.changingStatus()) {
      return;
    }

    const nextStatus: ProviderStatus = this.statusOf(provider) === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const actionLabel = nextStatus === 'INACTIVE' ? 'desactivar' : 'activar';

    if (
      nextStatus === 'INACTIVE' &&
      !confirm(`¿Deseas desactivar al proveedor "${provider.businessName}"?`)
    ) {
      return;
    }

    this.changingStatus.set(provider.id);

    this.providerService
      .updateStatus(provider.id, nextStatus)
      .pipe(finalize(() => this.changingStatus.set(null)))
      .subscribe({
        next: () => {
          this.showToast('success', `Proveedor ${actionLabel === 'desactivar' ? 'desactivado' : 'activado'} correctamente`);
          this.loadProviders({ showLoading: false });
        },
        error: () => this.showToast('error', `No se pudo ${actionLabel} el proveedor`),
      });
  }

  protected clearToast(): void {
    this.clearToastTimer();
    this.toast.set(null);
  }

  protected statusOf(provider: Provider): ProviderStatus {
    return provider.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  }

  protected responsibleName(provider: Provider): string {
    return `${provider.responsibleFirstName ?? ''} ${provider.responsibleLastName ?? ''}`.trim() || '—';
  }

  protected documentTypeShortLabel(documentTypeId: string): string {
    return this.documentTypes.find((t) => t.id === String(documentTypeId))?.shortLabel ?? 'DOC';
  }

  protected taxRegimeLabel(taxRegimeId: string): string {
    return this.taxRegimes.find((t) => t.id === String(taxRegimeId))?.label ?? '—';
  }

  protected locationLabel(provider: Provider): string {
    const dept = this.departments.find((d) => d.id === String(provider.departmentId))?.label;
    const city = this.cities.find((c) => c.id === String(provider.cityId))?.label;
    if (city && dept) {
      return `${city}, ${dept}`;
    }
    return provider.address || '—';
  }

  protected hasUnknownDocumentType(): boolean {
    const selected = this.form.controls.documentTypeId.value;
    return !!selected && !this.documentTypes.some((type) => type.id === selected);
  }

  protected hasUnknownTaxRegime(): boolean {
    const selected = this.form.controls.taxRegimeId.value;
    return !!selected && !this.taxRegimes.some((regime) => regime.id === selected);
  }

  protected showFieldError(controlName: ProviderFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.formSubmitted());
  }

  protected fieldError(controlName: ProviderFormControlName): string {
    const control = this.form.controls[controlName];

    if (!this.showFieldError(controlName)) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    if (controlName === 'businessName' && control.hasError('maxlength')) {
      return 'No puede superar 150 caracteres.';
    }

    if (controlName === 'documentNumber') {
      return 'El documento debe tener entre 6 y 20 dígitos.';
    }

    if (controlName === 'responsibleFirstName' || controlName === 'responsibleLastName') {
      if (control.hasError('maxlength')) {
        return 'No puede superar 100 caracteres.';
      }
      return 'Solo se permiten letras y espacios.';
    }

    if (controlName === 'phone') {
      return 'El teléfono debe tener exactamente 10 dígitos.';
    }

    if (controlName === 'email') {
      return 'Ingresa un correo electrónico válido.';
    }

    if (controlName === 'address' && control.hasError('maxlength')) {
      return 'No puede superar 200 caracteres.';
    }

    if (controlName === 'status') {
      return 'El estado debe ser Activo o Inactivo.';
    }

    return 'Campo no válido.';
  }

  protected onlyDigits(event: KeyboardEvent): void {
    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  private loadProviders(options: { showLoading?: boolean } = {}): void {
    const showLoading = options.showLoading ?? true;

    if (showLoading) {
      this.loading.set(true);
    }

    this.providerService.getProviders().subscribe({
      next: (providers) => {
        this.providers.set(providers);
        this.loading.set(false);
        const maxPage = Math.max(1, Math.ceil(this.filteredProviders().length / this.pageSize));
        if (this.currentPage() > maxPage) {
          this.currentPage.set(maxPage);
        }
      },
      error: () => {
        this.providers.set([]);
        this.loading.set(false);
        this.showToast('error', 'No se pudieron cargar los proveedores');
      },
    });
  }

  private updateCurrentProvider(raw: ProviderFormValue): Observable<unknown> | null {
    const provider = this.selectedProvider();
    const providerId = provider?.id;

    if (!provider || !providerId) {
      this.showToast('error', 'No se pudo guardar el proveedor');
      return null;
    }

    const request$ = this.providerService.updateProvider(
      providerId,
      this.buildUpdatePayload(raw, provider),
    );
    const currentStatus = this.statusOf(provider);

    return raw.status === currentStatus
      ? request$
      : request$.pipe(switchMap(() => this.providerService.updateStatus(providerId, raw.status)));
  }

  private buildCreatePayload(raw: ProviderFormValue): CreateProviderRequest {
    return {
      businessName: raw.businessName.trim(),
      documentTypeId: raw.documentTypeId.trim(),
      documentNumber: raw.documentNumber.trim(),
      taxRegimeId: raw.taxRegimeId.trim(),
      responsibleFirstName: raw.responsibleFirstName.trim(),
      responsibleLastName: raw.responsibleLastName.trim(),
      phone: raw.phone.trim(),
      email: raw.email.trim(),
      departmentId: raw.departmentId.trim(),
      cityId: raw.cityId.trim(),
      address: raw.address.trim(),
      branchId: raw.branchId.trim(),
    };
  }

  private buildUpdatePayload(raw: ProviderFormValue, provider: Provider): UpdateProviderRequest {
    return {
      ...this.buildCreatePayload(raw),
      email: provider.email,
    };
  }

  private closeDrawerAfterSave(): void {
    this.drawerOpen.set(false);
    this.selectedProvider.set(null);
    this.formSubmitted.set(false);
    this.form.controls.email.enable();
  }

  private statusValidator(control: AbstractControl): ValidationErrors | null {
    return this.providerStatuses.includes(control.value as ProviderStatus)
      ? null
      : { providerStatus: true };
  }

  private showToast(type: ProviderToastType, message: string): void {
    this.clearToastTimer();
    this.toast.set({ type, message });
    this.toastTimeoutId = window.setTimeout(() => this.toast.set(null), 4200);
  }

  private clearToastTimer(): void {
    if (this.toastTimeoutId !== null) {
      window.clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
  }

  private toastTimeoutId: number | null = null;
}
