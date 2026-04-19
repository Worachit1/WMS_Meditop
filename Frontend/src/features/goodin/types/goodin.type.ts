export interface GoodinType {
    id: string;
    name: string;
    quantity_receive: number;
    quantity_count: number;
    unit: string;
    lot: string;
    exp: string;
    qr_payload: string;
    p_name: string;
    zone_type: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
}

export interface GoodinUpdateData {
    quantity_count: number;
}

export interface GoodinUpdateLotExp {
    lot: string;
    lot_serial?: string | null;
    exp: string | null;
    no_expiry?: boolean;
}

export interface GoodinMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ApiGoodResponse {
    data: GoodinType[];
    meta: GoodinMeta;
}