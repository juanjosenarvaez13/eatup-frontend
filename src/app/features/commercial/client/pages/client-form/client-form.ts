import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import {
  CatalogOption,
  CityOption,
  Client,
  CreateClientRequest,
  UpdateClientRequest,
} from '@commercial/client/models/client.model';
import {
  ClientService,
  getClientErrorMessage,
} from '@commercial/client/services/client.service';

type ClientFormControlName =
  | 'firstName'
  | 'secondName'
  | 'firstLastName'
  | 'secondLastName'
  | 'documentTypeId'
  | 'documentNumber'
  | 'email'
  | 'phone'
  | 'address'
  | 'departmentId'
  | 'cityId'
  | 'taxRegimeId'
  | 'assignedSellerId';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './client-form.html',
  styleUrl: './client-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientForm implements OnInit {
  private readonly clientService = inject(ClientService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = new FormBuilder().nonNullable;
  private readonly lettersPattern = /^[A-Za-z\s]+$/;

  protected readonly isEditing = signal(false);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formSubmitted = signal(false);
  protected readonly generalError = signal('');
  protected readonly successMessage = signal('');

  protected readonly documentTypes: CatalogOption[] = [
    {
      id: '11111111-aaaa-aaaa-aaaa-111111111111',
      label: 'Cedula de ciudadania',
      shortLabel: 'CC',
    },
  ];

  protected readonly taxRegimes: CatalogOption[] = [
    {
      id: '036ffcc6-bb3f-487e-ba99-9b5376864456',
      label: 'Responsable de IVA',
    },
  ];

  protected readonly departments: CatalogOption[] = [
    {
      id: '22222222-bbbb-bbbb-bbbb-222222222222',
      label: 'Antioquia',
    },
  ];

  protected readonly cities: CityOption[] = [
    {
      id: 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
      label: 'Medellin',
      departmentId: '22222222-bbbb-bbbb-bbbb-222222222222',
    },
  ];

  private clientId = '';
  private loadedEmail = '';

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(this.lettersPattern)]],
    secondName: ['', [Validators.maxLength(100), Validators.pattern(this.lettersPattern)]],
    firstLastName: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(this.lettersPattern)]],
    secondLastName: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(this.lettersPattern)]],
    documentTypeId: [this.documentTypes[0]?.id ?? '', [Validators.required]],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{5,30}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],
    address: ['', [Validators.required, Validators.maxLength(255)]],
    departmentId: [this.departments[0]?.id ?? '', [Validators.required]],
    cityId: [this.cities[0]?.id ?? '', [Validators.required]],
    taxRegimeId: [this.taxRegimes[0]?.id ?? '', [Validators.required]],
    assignedSellerId: [1, [Validators.required, Validators.min(1)]],
    applyDiscounts: [true],
  });

  protected readonly availableCities = computed(() => {
    const departmentId = this.form.controls.departmentId.value;
    if (!departmentId) {
      return this.cities;
    }
    return this.cities.filter((city) => city.departmentId === departmentId);
  });

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get('id') ?? '';
    this.isEditing.set(!!this.clientId);

    this.form.controls.departmentId.valueChanges.subscribe((departmentId) => {
      const cityId = this.form.controls.cityId.value;
      const stillValid = this.cities.some(
        (city) => city.id === cityId && city.departmentId === departmentId,
      );
      if (!stillValid) {
        this.form.controls.cityId.setValue('');
      }
    });

    if (this.isEditing()) {
      this.loadClient();
      this.form.controls.email.disable();
    }
  }

  protected save(): void {
    if (this.submitting()) {
      return;
    }

    this.formSubmitted.set(true);
    this.generalError.set('');
    this.successMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();

    this.submitting.set(true);
    const request$ = this.isEditing()
      ? this.clientService.updateClient(this.clientId, payload as UpdateClientRequest)
      : this.clientService.createClient(payload);

    request$
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set('Solicitud enviada correctamente');
          setTimeout(
            () =>
              this.router.navigate(['/commercial/clients'], {
                queryParams: { refreshed: '1' },
              }),
            600,
          );
        },
        error: (error) => this.generalError.set(getClientErrorMessage(error)),
      });
  }

  protected showFieldError(controlName: ClientFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.formSubmitted());
  }

  protected fieldError(controlName: ClientFormControlName): string {
    const control = this.form.controls[controlName];

    if (!this.showFieldError(controlName)) {
      return '';
    }

    if (control.hasError('required') || control.hasError('min')) {
      return 'Este campo es obligatorio.';
    }

    if (
      controlName === 'firstName' ||
      controlName === 'secondName' ||
      controlName === 'firstLastName' ||
      controlName === 'secondLastName'
    ) {
      if (control.hasError('maxlength')) {
        return 'No puede superar 100 caracteres.';
      }
      return 'Solo se permiten letras y espacios.';
    }

    if (controlName === 'documentNumber') {
      return 'El documento debe tener entre 5 y 30 caracteres.';
    }

    if (controlName === 'email') {
      return 'Ingresa un correo electronico valido.';
    }

    if (controlName === 'phone') {
      return 'El telefono debe tener entre 10 y 15 digitos.';
    }

    if (controlName === 'address') {
      return 'La direccion no puede superar 255 caracteres.';
    }

    return 'Campo no valido.';
  }

  protected onlyDigits(event: KeyboardEvent): void {
    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  private loadClient(): void {
    this.loading.set(true);
    this.generalError.set('');

    this.clientService
      .getClientById(this.clientId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (client) => this.patchForm(client),
        error: (error) => this.generalError.set(getClientErrorMessage(error)),
      });
  }

  private patchForm(client: Client): void {
    this.loadedEmail = client.email;

    this.form.patchValue({
      firstName: client.firstName ?? '',
      secondName: client.secondName ?? '',
      firstLastName: client.firstLastName ?? '',
      secondLastName: client.secondLastName ?? '',
      documentTypeId: client.documentTypeId ?? '',
      documentNumber: client.documentNumber ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      cityId: client.cityId ?? '',
      taxRegimeId: client.taxRegimeId ?? '',
      assignedSellerId: client.assignedSellerId ?? 1,
      applyDiscounts: client.applyDiscounts ?? true,
    });
  }

  private buildPayload(): CreateClientRequest {
    const raw = this.form.getRawValue();

    return {
      firstName: raw.firstName.trim(),
      secondName: raw.secondName.trim() || null,
      firstLastName: raw.firstLastName.trim(),
      secondLastName: raw.secondLastName.trim(),
      documentTypeId: raw.documentTypeId,
      documentNumber: raw.documentNumber.trim(),
      email: (this.isEditing() ? this.loadedEmail : raw.email).trim().toLowerCase(),
      phone: raw.phone.trim(),
      address: raw.address.trim(),
      cityId: raw.cityId,
      taxRegimeId: raw.taxRegimeId,
      assignedSellerId: raw.assignedSellerId,
      applyDiscounts: raw.applyDiscounts,
    };
  }
}
