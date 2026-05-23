export type ProviderStatus = 'ACTIVE' | 'INACTIVE';

export interface Provider {
  id?: string;
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
  status?: ProviderStatus;
  createdAt?: string;
  modifiedAt?: string;
}

export type CreateProviderRequest = Pick<
  Provider,
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
  | 'branchId'
>;

export type UpdateProviderRequest = Omit<CreateProviderRequest, 'email'> & {
  email: string;
};

export interface UpdateProviderStatusRequest {
  status: ProviderStatus;
}

export interface CatalogOption {
  id: string;
  label: string;
  shortLabel?: string;
}

export interface CityOption extends CatalogOption {
  departmentId: string;
}
