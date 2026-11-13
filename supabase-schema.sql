-- Muestra de referencia · esquema central
-- Preparado para migrar desde la copia maestra local sin perder relaciones.

create extension if not exists pgcrypto;

create table if not exists pieces (
  uid text primary key,
  visible_id text unique not null,
  legacy_id text,
  id_history jsonb not null default '[]'::jsonb,
  created_order integer,
  display_order integer,
  sample_group text,
  caja text,
  sigla text,
  sitio text,
  coleccion text,
  publicacion text,
  pagina text,
  forma text,
  forma_otro text,
  integridad text,
  fotogrametria_url text,
  observaciones text,
  photo_path text,
  updated_at timestamptz not null default now()
);

create table if not exists fields (
  uid text primary key,
  visible_id text unique not null,
  legacy_id text,
  id_history jsonb not null default '[]'::jsonb,
  piece_uid text not null references pieces(uid) on delete cascade,
  catalog_code text,
  nombre text,
  nombre_otro text,
  tecnicas jsonb not null default '[]'::jsonb,
  tecnica_otro text,
  esquemas jsonb not null default '[]'::jsonb,
  clase_simetria text,
  colores text,
  observaciones text,
  created_order integer,
  updated_at timestamptz not null default now(),
  unique(piece_uid, catalog_code)
);

create table if not exists drawings (
  uid text primary key,
  visible_id text unique not null,
  legacy_id text,
  id_history jsonb not null default '[]'::jsonb,
  piece_uid text references pieces(uid) on delete cascade,
  field_uid text unique references fields(uid) on delete cascade,
  ref_original text,
  drawing_path text,
  observaciones text,
  created_order integer,
  updated_at timestamptz not null default now()
);

create table if not exists app_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pieces_display_order on pieces(display_order);
create index if not exists idx_fields_piece_uid on fields(piece_uid);
create index if not exists idx_drawings_piece_uid on drawings(piece_uid);
create index if not exists idx_drawings_field_uid on drawings(field_uid);

alter table pieces enable row level security;
alter table fields enable row level security;
alter table drawings enable row level security;
alter table app_meta enable row level security;
