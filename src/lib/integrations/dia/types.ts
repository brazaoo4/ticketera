export interface DiaAuthCredentials {
  sessionId: string;
  customerAccess: string;
  customerCode: string;
}

export interface DiaTicketDetailParams {
  begin: number;
  business: number;
  country: string;
  pos: number;
  store: number;
  ticket: number;
}

export interface DiaTicketSummary {
  detail_params: DiaTicketDetailParams;
  online: boolean;
  pilot_invoice?: boolean;
  return?: boolean;
  store_info: {
    address: string;
    city: string;
    postal_code: string;
  };
  submitted_date: string;
  ticket_unique_code: string;
  total_amount: number;
}

export interface DiaTicketListResponse {
  currency: string;
  customer?: {
    display_name?: string;
  };
  pagination?: {
    offset: number;
    page_size: number;
  };
  tickets: DiaTicketSummary[];
  total_tickets: number;
}

export interface DiaTicketDiscount {
  amount: number;
  coupon?: boolean;
  description: string;
}

export interface DiaTicketItem {
  amount: number;
  cancel: boolean;
  code: number;
  discounts?: DiaTicketDiscount[];
  name: string;
  price_per_unit: number;
  quantity: number;
  tax: string;
  variable_weight: boolean;
  weight: number;
}

export interface DiaTicketTax {
  amount?: number;
  base_amount?: number;
  rate?: number;
  name?: string;
  tax?: string;
  base?: number;
  percentage?: string;
  quota?: number;
  type?: string;
}

export interface DiaTicketDetailResponse {
  amount: {
    employee_discount: number;
    shipping_amount: number;
    total_accumulated: number;
    total_amount: number;
    total_amount_without_discounts: number;
    total_discounts: number;
  };
  corporate: {
    amount: number;
    info: {
      fiscal_code: string;
      name: string;
    };
    items: DiaTicketItem[];
    taxes: DiaTicketTax[];
  };
  currency: string;
  header: {
    cashier: number;
    code: number;
    digital_electronic_systems?: Array<{
      type: string;
      url_qr: string;
    }>;
    display_code: string;
    display_original_code?: string;
    pos: number;
    simplified_invoice: boolean;
    store_address: string;
    store_code: number;
    submitted_date: string;
    ticket_unique_code: string;
    type?: string;
  };
  online: boolean;
  payment: {
    payment_methods: Array<{
      amount: number;
      change_amount: number;
      payment_method: string;
    }>;
    total_to_pay: number;
  };
  return?: boolean;
  tef?: {
    lines: string[];
  };
  void?: boolean;
}
