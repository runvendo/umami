-- add provider columns to website_revenue
-- tracker-originated rows (via website_revenue_mv) pick up the defaults;
-- external provider payments are inserted directly with explicit values.
ALTER TABLE umami.website_revenue
    ADD COLUMN provider LowCardinality(String) DEFAULT 'web' AFTER event_name;

ALTER TABLE umami.website_revenue
    ADD COLUMN provider_id String DEFAULT '' AFTER provider;
