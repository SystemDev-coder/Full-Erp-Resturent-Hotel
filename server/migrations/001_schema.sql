-- ================================================================
--  HOSPITALITY ERP — FULL DATABASE SCHEMA
--  Version: 1.0.0  |  Modules: 8  |  Tables: 73+
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ================================================================
-- MODULE 1 — MASTER DATA
-- ================================================================

CREATE TABLE IF NOT EXISTS organization (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(200) NOT NULL,
    legal_name       VARCHAR(300),
    tax_id           VARCHAR(50),
    default_timezone VARCHAR(60)  NOT NULL DEFAULT 'Africa/Mogadishu',
    logo_url         TEXT,
    address          TEXT,
    phone            VARCHAR(30),
    email            VARCHAR(255),
    website          VARCHAR(255),
    settings         JSONB        NOT NULL DEFAULT '{}',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by       UUID,
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID
);

CREATE TABLE IF NOT EXISTS branch (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    name            VARCHAR(200) NOT NULL,
    code            VARCHAR(20)  NOT NULL,
    branch_type     VARCHAR(20)  NOT NULL
                        CHECK (branch_type IN ('hotel','restaurant','both')),
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) NOT NULL DEFAULT 'Somalia',
    phone           VARCHAR(30),
    email           VARCHAR(255),
    timezone        VARCHAR(60)  NOT NULL DEFAULT 'Africa/Mogadishu',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    opened_on       DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_branch_org    ON branch(organization_id);
CREATE INDEX IF NOT EXISTS idx_branch_active ON branch(organization_id) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fiscal_year (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organization(id),
    name            VARCHAR(50) NOT NULL,
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    is_closed       BOOLEAN     NOT NULL DEFAULT FALSE,
    closed_at       TIMESTAMPTZ,
    closed_by       UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    UNIQUE (organization_id, name),
    CONSTRAINT chk_fy_dates CHECK (end_date > start_date)
);

-- ================================================================
-- MODULE 2 — AUTH & USERS
-- ================================================================

CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    full_name       VARCHAR(200) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    phone           VARCHAR(30),
    password_hash   TEXT         NOT NULL,
    avatar_url      TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_attempts SMALLINT     NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_users_org    ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(organization_id) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_token (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE,
    device_info  VARCHAR(200),
    ip_address   INET,
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rtoken_user    ON refresh_token(user_id);
CREATE INDEX IF NOT EXISTS idx_rtoken_expires ON refresh_token(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_branch (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id  UUID        NOT NULL REFERENCES branch(id),
    role       VARCHAR(30) NOT NULL CHECK (role IN (
                   'org_admin','branch_manager','receptionist','housekeeper',
                   'hotel_cashier','cashier','waiter','chef','bar_staff',
                   'accountant','inventory_manager','report_viewer'
               )),
    is_primary BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    invited_by UUID        REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    UNIQUE (user_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_ub_user   ON user_branch(user_id);
CREATE INDEX IF NOT EXISTS idx_ub_branch ON user_branch(branch_id);
CREATE INDEX IF NOT EXISTS idx_ub_active ON user_branch(user_id) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS module_config (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organization(id),
    branch_id       UUID        REFERENCES branch(id),
    module_key      VARCHAR(50) NOT NULL,
    is_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
    config          JSONB       NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_module_org
    ON module_config(organization_id, module_key)
    WHERE branch_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_module_branch
    ON module_config(organization_id, branch_id, module_key)
    WHERE branch_id IS NOT NULL AND deleted_at IS NULL;

-- ================================================================
-- MODULE 3 — HOTEL
-- ================================================================

CREATE TABLE IF NOT EXISTS hotel (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id         UUID          NOT NULL UNIQUE REFERENCES branch(id),
    star_rating       SMALLINT      CHECK (star_rating BETWEEN 1 AND 5),
    check_in_time     TIME          NOT NULL DEFAULT '14:00',
    check_out_time    TIME          NOT NULL DEFAULT '11:00',
    late_checkout_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    amenities         JSONB         NOT NULL DEFAULT '[]',
    policies          JSONB         NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);

CREATE TABLE IF NOT EXISTS room_type (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id          UUID         NOT NULL REFERENCES hotel(id),
    name              VARCHAR(100) NOT NULL,
    description       TEXT,
    max_adults        SMALLINT     NOT NULL DEFAULT 2,
    max_children      SMALLINT     NOT NULL DEFAULT 1,
    bed_configuration VARCHAR(100),
    area_sqm          NUMERIC(6,1),
    features          JSONB        NOT NULL DEFAULT '[]',
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID,
    UNIQUE (hotel_id, name)
);

CREATE TABLE IF NOT EXISTS rate_plan (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id              UUID          NOT NULL REFERENCES hotel(id),
    room_type_id          UUID          NOT NULL REFERENCES room_type(id),
    name                  VARCHAR(100)  NOT NULL,
    price_per_night       NUMERIC(10,2) NOT NULL CHECK (price_per_night >= 0),
    min_stay_nights       SMALLINT      NOT NULL DEFAULT 1,
    is_breakfast_included BOOLEAN       NOT NULL DEFAULT FALSE,
    valid_from            DATE          NOT NULL,
    valid_to              DATE,
    day_of_week_mask      SMALLINT      NOT NULL DEFAULT 127,
    is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID,
    CONSTRAINT chk_rate_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_rate_plan_hotel ON rate_plan(hotel_id);

CREATE TABLE IF NOT EXISTS room (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id     UUID        NOT NULL REFERENCES hotel(id),
    room_type_id UUID        NOT NULL REFERENCES room_type(id),
    room_number  VARCHAR(10) NOT NULL,
    floor        SMALLINT    NOT NULL DEFAULT 1,
    status       VARCHAR(20) NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','occupied','maintenance','out_of_order','cleaning')),
    is_smoking   BOOLEAN     NOT NULL DEFAULT FALSE,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID,
    UNIQUE (hotel_id, room_number)
);
CREATE INDEX IF NOT EXISTS idx_room_hotel     ON room(hotel_id);
CREATE INDEX IF NOT EXISTS idx_room_status    ON room(hotel_id, status);
CREATE INDEX IF NOT EXISTS idx_room_available ON room(hotel_id) WHERE status = 'available' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS guest (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    id_type         VARCHAR(30)  CHECK (id_type IN ('passport','national_id','driving_license','other')),
    id_number       VARCHAR(60),
    nationality     VARCHAR(100),
    date_of_birth   DATE,
    gender          CHAR(1)      CHECK (gender IN ('M','F','O')),
    address         TEXT,
    loyalty_tier    VARCHAR(20)  NOT NULL DEFAULT 'standard'
                        CHECK (loyalty_tier IN ('standard','silver','gold','platinum')),
    loyalty_points  INT          NOT NULL DEFAULT 0,
    notes           TEXT,
    is_blacklisted  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT chk_guest_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_guest_org   ON guest(organization_id);
CREATE INDEX IF NOT EXISTS idx_guest_email ON guest(email);
CREATE INDEX IF NOT EXISTS idx_guest_phone ON guest(phone);
CREATE INDEX IF NOT EXISTS idx_guest_name  ON guest USING gin(
    (first_name || ' ' || last_name) gin_trgm_ops
);

CREATE TABLE IF NOT EXISTS loyalty_transaction (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id       UUID         NOT NULL REFERENCES guest(id),
    points_change  INT          NOT NULL,
    balance_after  INT          NOT NULL,
    reason         VARCHAR(100) NOT NULL,
    reference_type VARCHAR(30),
    reference_id   UUID,
    created_by     UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_guest ON loyalty_transaction(guest_id);

CREATE TABLE IF NOT EXISTS booking (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID          NOT NULL REFERENCES branch(id),
    room_id             UUID          NOT NULL REFERENCES room(id),
    rate_plan_id        UUID          REFERENCES rate_plan(id),
    primary_guest_id    UUID          NOT NULL REFERENCES guest(id),
    booking_ref         VARCHAR(24)   NOT NULL UNIQUE,
    check_in_date       DATE          NOT NULL,
    check_out_date      DATE          NOT NULL,
    actual_check_in     TIMESTAMPTZ,
    actual_check_out    TIMESTAMPTZ,
    num_adults          SMALLINT      NOT NULL DEFAULT 1,
    num_children        SMALLINT      NOT NULL DEFAULT 0,
    num_nights          SMALLINT      GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
    rate_per_night      NUMERIC(10,2) NOT NULL,
    subtotal            NUMERIC(12,2) NOT NULL,
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_note       VARCHAR(200),
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_rate            NUMERIC(5,2)  NOT NULL DEFAULT 0,
    service_charge      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(12,2) NOT NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'confirmed'
                            CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
    source              VARCHAR(30)   NOT NULL DEFAULT 'direct'
                            CHECK (source IN ('direct','walk_in','phone','online','ota','agent')),
    breakfast_included  BOOLEAN       NOT NULL DEFAULT FALSE,
    special_requests    TEXT,
    cancellation_reason TEXT,
    cancelled_at        TIMESTAMPTZ,
    cancelled_by        UUID,
    created_by          UUID          REFERENCES users(id),
    updated_by          UUID,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID,
    CONSTRAINT chk_booking_dates CHECK (check_out_date > check_in_date),
    EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in_date, check_out_date, '[)') WITH &&
    ) WHERE (status NOT IN ('cancelled','no_show') AND deleted_at IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_booking_room   ON booking(room_id);
CREATE INDEX IF NOT EXISTS idx_booking_guest  ON booking(primary_guest_id);
CREATE INDEX IF NOT EXISTS idx_booking_dates  ON booking(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_booking_status ON booking(status);
CREATE INDEX IF NOT EXISTS idx_booking_branch ON booking(branch_id);
CREATE INDEX IF NOT EXISTS idx_booking_active ON booking(branch_id, check_in_date)
    WHERE status IN ('confirmed','checked_in') AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS booking_guest (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID    NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    guest_id   UUID    NOT NULL REFERENCES guest(id),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    UNIQUE (booking_id, guest_id)
);

CREATE TABLE IF NOT EXISTS booking_service (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id       UUID          NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    service_name     VARCHAR(200)  NOT NULL,
    service_category VARCHAR(30)   NOT NULL DEFAULT 'other'
                         CHECK (service_category IN ('minibar','laundry','room_service',
                                                     'telephone','spa','transport','other')),
    quantity         NUMERIC(8,2)  NOT NULL DEFAULT 1,
    unit_price       NUMERIC(10,2) NOT NULL,
    line_total       NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    notes            TEXT,
    served_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by       UUID,
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID
);
CREATE INDEX IF NOT EXISTS idx_bsvc_booking ON booking_service(booking_id);

CREATE TABLE IF NOT EXISTS housekeeping_task (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id       UUID        NOT NULL REFERENCES room(id),
    booking_id    UUID        REFERENCES booking(id),
    assigned_to   UUID,
    task_type     VARCHAR(20) NOT NULL DEFAULT 'checkout_clean'
                      CHECK (task_type IN ('checkout_clean','stayover_clean',
                                           'turndown','inspection','deep_clean')),
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed','inspected','skipped')),
    scheduled_for DATE        NOT NULL DEFAULT CURRENT_DATE,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    inspected_by  UUID,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE INDEX IF NOT EXISTS idx_hk_room   ON housekeeping_task(room_id);
CREATE INDEX IF NOT EXISTS idx_hk_date   ON housekeeping_task(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_hk_status ON housekeeping_task(status) WHERE deleted_at IS NULL;

-- ================================================================
-- MODULE 4 — RESTAURANT
-- ================================================================

CREATE TABLE IF NOT EXISTS restaurant (
    id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id              UUID         NOT NULL UNIQUE REFERENCES branch(id),
    name                   VARCHAR(200) NOT NULL,
    cuisine_type           VARCHAR(100),
    seating_capacity       SMALLINT     NOT NULL DEFAULT 0,
    accepts_reservations   BOOLEAN      NOT NULL DEFAULT TRUE,
    waiters_handle_billing BOOLEAN      NOT NULL DEFAULT FALSE,
    operating_hours        JSONB        NOT NULL DEFAULT '{}',
    tax_rate               NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    service_charge_pct     NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ,
    deleted_by             UUID
);

CREATE TABLE IF NOT EXISTS menu_category (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID         NOT NULL REFERENCES restaurant(id),
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    display_order SMALLINT     NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    UNIQUE (restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS menu_item (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id       UUID          NOT NULL REFERENCES menu_category(id),
    sku               VARCHAR(50),
    name              VARCHAR(200)  NOT NULL,
    description       TEXT,
    image_url         TEXT,
    price             NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    cost_price        NUMERIC(10,2) NOT NULL DEFAULT 0,
    item_type         VARCHAR(20)   NOT NULL DEFAULT 'food'
                          CHECK (item_type IN ('food','beverage','combo','addon')),
    is_halal          BOOLEAN       NOT NULL DEFAULT TRUE,
    is_vegetarian     BOOLEAN       NOT NULL DEFAULT FALSE,
    allergens         JSONB         NOT NULL DEFAULT '[]',
    prep_time_minutes SMALLINT      NOT NULL DEFAULT 0,
    is_available      BOOLEAN       NOT NULL DEFAULT TRUE,
    display_order     SMALLINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_menu_item_cat   ON menu_item(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_avail ON menu_item(category_id)
    WHERE is_available = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS modifier_group (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID         NOT NULL REFERENCES restaurant(id),
    name           VARCHAR(100) NOT NULL,
    selection_type VARCHAR(10)  NOT NULL DEFAULT 'single'
                       CHECK (selection_type IN ('single','multiple')),
    is_required    BOOLEAN      NOT NULL DEFAULT FALSE,
    min_selections SMALLINT     NOT NULL DEFAULT 0,
    max_selections SMALLINT     NOT NULL DEFAULT 1,
    display_order  SMALLINT     NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID
);

CREATE TABLE IF NOT EXISTS menu_modifier (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      UUID          NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
    name          VARCHAR(100)  NOT NULL,
    price_delta   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
    is_available  BOOLEAN       NOT NULL DEFAULT TRUE,
    display_order SMALLINT      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE IF NOT EXISTS menu_item_modifier_group (
    menu_item_id UUID        NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
    group_id     UUID        NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID,
    PRIMARY KEY (menu_item_id, group_id)
);

CREATE TABLE IF NOT EXISTS table_area (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID         NOT NULL REFERENCES restaurant(id),
    name          VARCHAR(100) NOT NULL,
    area_type     VARCHAR(20)  NOT NULL DEFAULT 'indoor'
                      CHECK (area_type IN ('indoor','outdoor','rooftop','private','bar')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    UNIQUE (restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS dining_table (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id      UUID        NOT NULL REFERENCES table_area(id),
    table_number VARCHAR(10) NOT NULL,
    capacity     SMALLINT    NOT NULL DEFAULT 4,
    status       VARCHAR(20) NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','reserved','occupied','cleaning','inactive')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ,
    deleted_by   UUID,
    UNIQUE (area_id, table_number)
);
CREATE INDEX IF NOT EXISTS idx_dtable_area   ON dining_table(area_id);
CREATE INDEX IF NOT EXISTS idx_dtable_status ON dining_table(area_id, status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS table_reservation (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dining_table_id UUID        NOT NULL REFERENCES dining_table(id),
    guest_id        UUID        REFERENCES guest(id),
    reserved_at     TIMESTAMPTZ NOT NULL,
    expected_end_at TIMESTAMPTZ,
    party_size      SMALLINT    NOT NULL DEFAULT 1,
    walk_in_name    VARCHAR(200),
    walk_in_phone   VARCHAR(30),
    status          VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT chk_res_contact CHECK (guest_id IS NOT NULL OR walk_in_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tres_table ON table_reservation(dining_table_id);
CREATE INDEX IF NOT EXISTS idx_tres_time  ON table_reservation(reserved_at);

CREATE TABLE IF NOT EXISTS order_header (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    dining_table_id UUID          REFERENCES dining_table(id),
    reservation_id  UUID          REFERENCES table_reservation(id),
    booking_id      UUID          REFERENCES booking(id),
    server_staff_id UUID,
    order_ref       VARCHAR(24)   NOT NULL UNIQUE,
    order_type      VARCHAR(20)   NOT NULL DEFAULT 'dine_in'
                        CHECK (order_type IN ('dine_in','takeaway','delivery','room_service')),
    status          VARCHAR(20)   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','preparing','ready','served','billed','paid','cancelled')),
    subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_note   VARCHAR(200),
    tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
    service_charge  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    created_by      UUID          REFERENCES users(id),
    updated_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_oh_branch ON order_header(branch_id);
CREATE INDEX IF NOT EXISTS idx_oh_table  ON order_header(dining_table_id) WHERE dining_table_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oh_status ON order_header(branch_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_oh_ref    ON order_header(order_ref);

CREATE TABLE IF NOT EXISTS order_line (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL REFERENCES order_header(id) ON DELETE CASCADE,
    menu_item_id    UUID          NOT NULL REFERENCES menu_item(id),
    item_name_snap  VARCHAR(200)  NOT NULL,
    quantity        SMALLINT      NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    line_total      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount) STORED,
    special_request TEXT,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','preparing','ready','served','cancelled')),
    sent_to_kitchen TIMESTAMPTZ,
    served_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_ol_order ON order_line(order_id);
CREATE INDEX IF NOT EXISTS idx_ol_item  ON order_line(menu_item_id);

CREATE TABLE IF NOT EXISTS order_line_modifier (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_line_id UUID          NOT NULL REFERENCES order_line(id) ON DELETE CASCADE,
    modifier_id   UUID          NOT NULL REFERENCES menu_modifier(id),
    modifier_name VARCHAR(100)  NOT NULL,
    price_delta   NUMERIC(10,2) NOT NULL DEFAULT 0,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE INDEX IF NOT EXISTS idx_olm_line ON order_line_modifier(order_line_id);

-- ================================================================
-- MODULE 5 — INVENTORY
-- ================================================================

CREATE TABLE IF NOT EXISTS warehouse (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id     UUID         NOT NULL REFERENCES branch(id),
    name          VARCHAR(100) NOT NULL,
    location_note TEXT,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS item (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    sku             VARCHAR(60)   NOT NULL UNIQUE,
    name            VARCHAR(200)  NOT NULL,
    category        VARCHAR(50)   NOT NULL DEFAULT 'general',
    item_type       VARCHAR(20)   NOT NULL DEFAULT 'ingredient'
                        CHECK (item_type IN ('ingredient','supply','finished_good','asset')),
    unit_of_measure VARCHAR(20)   NOT NULL DEFAULT 'kg'
                        CHECK (unit_of_measure IN ('kg','g','litre','ml','piece','box','bag','can','bottle','pack')),
    reorder_level   NUMERIC(10,3) NOT NULL DEFAULT 0,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_item_org      ON item(organization_id);
CREATE INDEX IF NOT EXISTS idx_item_category ON item(category);

CREATE TABLE IF NOT EXISTS recipe (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id  UUID          NOT NULL REFERENCES menu_item(id),
    item_id       UUID          NOT NULL REFERENCES item(id),
    quantity_used NUMERIC(10,4) NOT NULL CHECK (quantity_used > 0),
    unit          VARCHAR(20)   NOT NULL,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    UNIQUE (menu_item_id, item_id)
);

CREATE TABLE IF NOT EXISTS stock_balance (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id     UUID          NOT NULL REFERENCES warehouse(id),
    item_id          UUID          NOT NULL REFERENCES item(id),
    quantity_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
    average_cost     NUMERIC(12,4) NOT NULL DEFAULT 0,
    last_updated     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_wh   ON stock_balance(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_balance(item_id);

CREATE TABLE IF NOT EXISTS stock_movement (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id   UUID          NOT NULL REFERENCES warehouse(id),
    item_id        UUID          NOT NULL REFERENCES item(id),
    movement_type  VARCHAR(30)   NOT NULL
                       CHECK (movement_type IN ('purchase','issue_kitchen','adjustment',
                                                'transfer_in','transfer_out','waste','return')),
    quantity       NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost      NUMERIC(12,4) NOT NULL DEFAULT 0,
    reference_type VARCHAR(30),
    reference_id   UUID,
    notes          TEXT,
    moved_by_staff UUID,
    moved_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID
);
CREATE INDEX IF NOT EXISTS idx_smove_wh   ON stock_movement(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_smove_item ON stock_movement(item_id);
CREATE INDEX IF NOT EXISTS idx_smove_time ON stock_movement(moved_at);
CREATE INDEX IF NOT EXISTS idx_smove_ref  ON stock_movement(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS supplier (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    name          VARCHAR(200)  NOT NULL,
    contact_name  VARCHAR(200),
    phone         VARCHAR(30),
    email         VARCHAR(255),
    address       TEXT,
    tax_id        VARCHAR(50),
    begin_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE INDEX IF NOT EXISTS idx_supplier_org ON supplier(organization_id);

CREATE TABLE IF NOT EXISTS purchase_order (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id     UUID          NOT NULL REFERENCES branch(id),
    supplier_id   UUID          NOT NULL REFERENCES supplier(id),
    warehouse_id  UUID          NOT NULL REFERENCES warehouse(id),
    po_number     VARCHAR(24)   NOT NULL UNIQUE,
    status        VARCHAR(20)   NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','partial','received','cancelled')),
    order_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    received_date DATE,
    subtotal      NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes         TEXT,
    approved_by   UUID,
    created_by    UUID          REFERENCES users(id),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE INDEX IF NOT EXISTS idx_po_branch   ON purchase_order(branch_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_order(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status   ON purchase_order(status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS purchase_line (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id             UUID          NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
    item_id           UUID          NOT NULL REFERENCES item(id),
    quantity_ordered  NUMERIC(12,3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit_cost         NUMERIC(12,4) NOT NULL,
    line_total        NUMERIC(12,2) GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
    notes             TEXT,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_pline_po ON purchase_line(po_id);

CREATE TABLE IF NOT EXISTS goods_receipt (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id          UUID        NOT NULL REFERENCES purchase_order(id),
    warehouse_id   UUID        NOT NULL REFERENCES warehouse(id),
    receipt_number VARCHAR(24) NOT NULL UNIQUE,
    received_by    UUID,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID
);
CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_receipt(po_id);

CREATE TABLE IF NOT EXISTS goods_receipt_line (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id        UUID          NOT NULL REFERENCES goods_receipt(id) ON DELETE CASCADE,
    po_line_id        UUID          NOT NULL REFERENCES purchase_line(id),
    item_id           UUID          NOT NULL REFERENCES item(id),
    quantity_received NUMERIC(12,3) NOT NULL CHECK (quantity_received > 0),
    unit_cost         NUMERIC(12,4) NOT NULL,
    batch_number      VARCHAR(50),
    expiry_date       DATE,
    notes             TEXT,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_grnl_receipt ON goods_receipt_line(receipt_id);
CREATE INDEX IF NOT EXISTS idx_grnl_item    ON goods_receipt_line(item_id);

-- ================================================================
-- MODULE 6 — HR
-- ================================================================

CREATE TABLE IF NOT EXISTS department (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id  UUID         NOT NULL REFERENCES branch(id),
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,
    UNIQUE (branch_id, name)
);
CREATE INDEX IF NOT EXISTS idx_dept_branch ON department(branch_id);

CREATE TABLE IF NOT EXISTS staff (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    department_id   UUID          REFERENCES department(id),
    employee_id     VARCHAR(20)   NOT NULL,
    first_name      VARCHAR(100)  NOT NULL,
    last_name       VARCHAR(100)  NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    role            VARCHAR(50)   NOT NULL,
    employment_type VARCHAR(20)   NOT NULL DEFAULT 'full_time'
                        CHECK (employment_type IN ('full_time','part_time','contract','casual')),
    basic_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
    joined_at       DATE          NOT NULL DEFAULT CURRENT_DATE,
    left_at         DATE,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    UNIQUE (branch_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_branch ON staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_dept   ON staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(branch_id) WHERE is_active = TRUE AND deleted_at IS NULL;

-- Update housekeeping_task foreign key on assigned_to → staff
ALTER TABLE housekeeping_task
    ADD CONSTRAINT fk_hk_staff FOREIGN KEY (assigned_to)
    REFERENCES staff(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS payroll_run (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id        UUID          NOT NULL REFERENCES branch(id),
    period_start     DATE          NOT NULL,
    period_end       DATE          NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','approved','paid')),
    total_gross      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_net        NUMERIC(12,2) NOT NULL DEFAULT 0,
    approved_by      UUID          REFERENCES users(id),
    approved_at      TIMESTAMPTZ,
    created_by       UUID          REFERENCES users(id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID
);
CREATE INDEX IF NOT EXISTS idx_payrun_branch ON payroll_run(branch_id);

CREATE TABLE IF NOT EXISTS payroll_line (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID         NOT NULL REFERENCES payroll_run(id) ON DELETE CASCADE,
    staff_id      UUID          NOT NULL REFERENCES staff(id),
    basic_salary  NUMERIC(12,2) NOT NULL,
    allowances    NUMERIC(12,2) NOT NULL DEFAULT 0,
    deductions    NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay       NUMERIC(12,2) NOT NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payline_run   ON payroll_line(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payline_staff ON payroll_line(staff_id);

-- ================================================================
-- MODULE 7 — ACCOUNTING
-- ================================================================

CREATE TABLE IF NOT EXISTS account (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    branch_id       UUID         REFERENCES branch(id),
    account_type    VARCHAR(20)  NOT NULL
                        CHECK (account_type IN ('bank','cash','mobile_money','supplier',
                                                'customer','expense','income','equity','asset')),
    name            VARCHAR(200) NOT NULL,
    institution     VARCHAR(200),
    account_number  VARCHAR(60),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    opened_date     DATE         NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_account_org    ON account(organization_id);
CREATE INDEX IF NOT EXISTS idx_account_branch ON account(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_type   ON account(account_type) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS transaction (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID          NOT NULL REFERENCES organization(id),
    branch_id        UUID          NOT NULL REFERENCES branch(id),
    account_id       UUID          NOT NULL REFERENCES account(id),
    direction        VARCHAR(3)    NOT NULL CHECK (direction IN ('in','out')),
    transaction_type VARCHAR(30)   NOT NULL CHECK (transaction_type IN (
        'income','expense','payment_received','payment_made','refund',
        'transfer_in','transfer_out','adjustment','salary',
        'room_charge','restaurant_charge'
    )),
    reference_type   VARCHAR(30)   NOT NULL CHECK (reference_type IN (
        'booking','order','invoice','ap_invoice','purchase_order',
        'payroll_run','expense_payment','refund_payment',
        'adjustment_entry','transfer_entry','account_transfer',
        'salary_payment','other_income'
    )),
    reference_id     UUID,
    description      TEXT          NOT NULL,
    notes            TEXT,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    transaction_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    transaction_time TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    status           VARCHAR(20)   NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('pending','completed','failed','voided')),
    ip_address       INET,
    user_agent       TEXT,
    created_by       UUID          REFERENCES users(id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID
);
CREATE INDEX IF NOT EXISTS idx_trans_org     ON transaction(organization_id);
CREATE INDEX IF NOT EXISTS idx_trans_branch  ON transaction(branch_id);
CREATE INDEX IF NOT EXISTS idx_trans_account ON transaction(account_id);
CREATE INDEX IF NOT EXISTS idx_trans_date    ON transaction(transaction_date);
CREATE INDEX IF NOT EXISTS idx_trans_ref     ON transaction(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_trans_active  ON transaction(account_id, transaction_date)
    WHERE status = 'completed' AND deleted_at IS NULL;

CREATE OR REPLACE VIEW account_balance AS
SELECT
    a.id,
    a.organization_id,
    a.branch_id,
    a.account_type,
    a.name,
    COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'in'  AND t.status = 'completed' AND t.deleted_at IS NULL), 0)
    -
    COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'out' AND t.status = 'completed' AND t.deleted_at IS NULL), 0)
    AS balance
FROM account a
LEFT JOIN transaction t ON t.account_id = a.id
WHERE a.deleted_at IS NULL
GROUP BY a.id, a.organization_id, a.branch_id, a.account_type, a.name;

-- ── New Accounting Tables ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_transfer (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    from_account_id UUID          NOT NULL REFERENCES account(id),
    to_account_id   UUID          NOT NULL REFERENCES account(id),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    transfer_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
    description     TEXT,
    reference       VARCHAR(100),
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_acctrans_date ON account_transfer(transfer_date);

CREATE TABLE IF NOT EXISTS other_income (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    name            VARCHAR(200)  NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    account_id      UUID          REFERENCES account(id),
    income_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
    description     TEXT,
    reference       VARCHAR(100),
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_othinc_branch ON other_income(branch_id);
CREATE INDEX IF NOT EXISTS idx_othinc_date   ON other_income(income_date);

CREATE TABLE IF NOT EXISTS expense (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organization(id),
    branch_id       UUID         NOT NULL REFERENCES branch(id),
    name            VARCHAR(200) NOT NULL,
    category        VARCHAR(50)  NOT NULL,
    description     TEXT,
    is_recurring    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by      UUID         REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_exp_org    ON expense(organization_id);
CREATE INDEX IF NOT EXISTS idx_exp_branch ON expense(branch_id);

CREATE TABLE IF NOT EXISTS expense_charge (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    expense_id      UUID          NOT NULL REFERENCES expense(id),
    exp_id          INTEGER       NOT NULL,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    charge_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
    due_date        DATE,
    description     TEXT,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','paid','voided')),
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_expchrg_expense ON expense_charge(expense_id);
CREATE INDEX IF NOT EXISTS idx_expchrg_branch  ON expense_charge(branch_id);

CREATE TABLE IF NOT EXISTS expense_payment (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID          NOT NULL REFERENCES organization(id),
    branch_id         UUID          NOT NULL REFERENCES branch(id),
    expense_charge_id UUID          NOT NULL REFERENCES expense_charge(id),
    account_id        UUID          NOT NULL REFERENCES account(id),
    amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    reference_number  VARCHAR(100),
    notes             TEXT,
    paid_by           UUID          REFERENCES users(id),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_exppay_charge ON expense_payment(expense_charge_id);

CREATE TABLE IF NOT EXISTS salary_charge (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organization(id),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    staff_id        UUID          NOT NULL REFERENCES staff(id),
    period_start    DATE          NOT NULL,
    period_end      DATE          NOT NULL,
    gross_amount    NUMERIC(12,2) NOT NULL CHECK (gross_amount > 0),
    deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_amount      NUMERIC(12,2) NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','paid')),
    created_by      UUID          REFERENCES users(id),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_salchrg_staff  ON salary_charge(staff_id);
CREATE INDEX IF NOT EXISTS idx_salchrg_branch ON salary_charge(branch_id);

CREATE TABLE IF NOT EXISTS salary_payment (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID          NOT NULL REFERENCES organization(id),
    branch_id        UUID          NOT NULL REFERENCES branch(id),
    salary_charge_id UUID          NOT NULL REFERENCES salary_charge(id),
    account_id       UUID          NOT NULL REFERENCES account(id),
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
    reference_number VARCHAR(100),
    notes            TEXT,
    paid_by          UUID          REFERENCES users(id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID
);
CREATE INDEX IF NOT EXISTS idx_salpay_charge ON salary_payment(salary_charge_id);

CREATE TABLE IF NOT EXISTS assets (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   UUID          NOT NULL REFERENCES organization(id),
    branch_id         UUID          REFERENCES branch(id),
    asset_type        VARCHAR(30)   NOT NULL CHECK (asset_type IN ('current','non_current','intangible')),
    asset_category    VARCHAR(50)   NOT NULL,
    name              VARCHAR(200)  NOT NULL,
    description       TEXT,
    purchase_date     DATE,
    purchase_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
    current_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
    depreciation_rate NUMERIC(5,2)  DEFAULT 0,
    serial_number     VARCHAR(100),
    location          TEXT,
    account_id        UUID          REFERENCES account(id),
    is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_assets_org    ON assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(branch_id);
CREATE INDEX IF NOT EXISTS idx_assets_type   ON assets(asset_type);

-- ── POS Session & Invoice ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_session (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id       UUID          NOT NULL REFERENCES branch(id),
    staff_id        UUID          NOT NULL REFERENCES staff(id),
    terminal_name   VARCHAR(50),
    opening_cash    NUMERIC(12,2) NOT NULL DEFAULT 0,
    closing_cash    NUMERIC(12,2),
    expected_cash   NUMERIC(12,2),
    cash_difference NUMERIC(12,2),
    status          VARCHAR(20)   NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','discrepancy')),
    opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_pos_branch ON pos_session(branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_open   ON pos_session(branch_id) WHERE status = 'open' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id         UUID          NOT NULL REFERENCES branch(id),
    guest_id          UUID          REFERENCES guest(id),
    booking_id        UUID          REFERENCES booking(id),
    order_id          UUID          REFERENCES order_header(id),
    invoice_number    VARCHAR(24)   NOT NULL UNIQUE,
    invoice_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
    due_date          DATE,
    subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_rate          NUMERIC(5,2)  NOT NULL DEFAULT 0,
    service_charge    NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_due        NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    status            VARCHAR(20)   NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','issued','partially_paid','paid','voided','overdue')),
    payment_method    VARCHAR(20)   CHECK (payment_method IN ('cash','card','mobile','room_charge',
                                                               'bank_transfer','complimentary')),
    notes             TEXT,
    voided_at         TIMESTAMPTZ,
    voided_reason     TEXT,
    created_by        UUID          REFERENCES users(id),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);
CREATE INDEX IF NOT EXISTS idx_inv_branch  ON invoice(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_guest   ON invoice(guest_id);
CREATE INDEX IF NOT EXISTS idx_inv_status  ON invoice(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_date    ON invoice(invoice_date);

CREATE TABLE IF NOT EXISTS invoice_line (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id    UUID          NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    description   VARCHAR(300)  NOT NULL,
    quantity      NUMERIC(8,2)  NOT NULL DEFAULT 1,
    unit_price    NUMERIC(10,2) NOT NULL,
    line_total    NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    reference_type VARCHAR(30),
    reference_id  UUID,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE INDEX IF NOT EXISTS idx_invline_inv ON invoice_line(invoice_id);

-- ── AP Invoice (supplier invoices) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ap_invoice (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id      UUID          NOT NULL REFERENCES branch(id),
    supplier_id    UUID          NOT NULL REFERENCES supplier(id),
    po_id          UUID          REFERENCES purchase_order(id),
    invoice_number VARCHAR(60)   NOT NULL,
    invoice_date   DATE          NOT NULL,
    due_date       DATE,
    total_amount   NUMERIC(12,2) NOT NULL,
    amount_paid    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status         VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                       CHECK (status IN ('unpaid','partially_paid','paid','voided')),
    notes          TEXT,
    created_by     UUID          REFERENCES users(id),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID
);
CREATE INDEX IF NOT EXISTS idx_apinv_branch    ON ap_invoice(branch_id);
CREATE INDEX IF NOT EXISTS idx_apinv_supplier  ON ap_invoice(supplier_id);
CREATE INDEX IF NOT EXISTS idx_apinv_status    ON ap_invoice(status) WHERE deleted_at IS NULL;

-- ================================================================
-- MODULE 8 — AUDIT LOG
-- ================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        REFERENCES users(id),
    branch_id    UUID        REFERENCES branch(id),
    action       VARCHAR(50) NOT NULL,
    table_name   VARCHAR(60),
    record_id    UUID,
    old_values   JSONB,
    new_values   JSONB,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_log(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_table  ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_log(created_at);
