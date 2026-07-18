ALTER TABLE daily_study_logs 
ADD COLUMN IF NOT EXISTS hourly_reviews integer[] DEFAULT array_fill(0, ARRAY[24]),
ADD COLUMN IF NOT EXISTS hourly_correct integer[] DEFAULT array_fill(0, ARRAY[24]),
ADD COLUMN IF NOT EXISTS ai_report text;

CREATE OR REPLACE FUNCTION increment_study_log(
    p_user_id UUID, 
    p_topic TEXT DEFAULT NULL,
    p_is_correct BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_hour integer;
BEGIN
    -- Obtém a hora atual no fuso horário oficial (Horário de Brasília)
    current_hour := extract(hour from (now() at time zone 'America/Sao_Paulo'))::integer;

    INSERT INTO daily_study_logs (user_id, study_date, review_count, topics, hourly_reviews, hourly_correct)
    VALUES (
        p_user_id,
        current_date,
        1,
        CASE WHEN p_topic IS NOT NULL THEN ARRAY[p_topic] ELSE '{}'::TEXT[] END,
        (
            SELECT array_agg(CASE WHEN i = current_hour + 1 THEN 1 ELSE 0 END) 
            FROM generate_series(1, 24) i
        ),
        (
            SELECT array_agg(CASE WHEN i = current_hour + 1 AND p_is_correct THEN 1 ELSE 0 END) 
            FROM generate_series(1, 24) i
        )
    )
    ON CONFLICT (user_id, study_date)
    DO UPDATE SET 
        review_count = daily_study_logs.review_count + 1,
        topics = CASE 
                    WHEN p_topic IS NOT NULL AND NOT (p_topic = ANY(COALESCE(daily_study_logs.topics, '{}'::text[]))) 
                    THEN array_append(COALESCE(daily_study_logs.topics, '{}'::text[]), p_topic)
                    ELSE COALESCE(daily_study_logs.topics, '{}'::text[])
                 END,
        hourly_reviews[current_hour + 1] = COALESCE(daily_study_logs.hourly_reviews[current_hour + 1], 0) + 1,
        hourly_correct[current_hour + 1] = COALESCE(daily_study_logs.hourly_correct[current_hour + 1], 0) + 
            CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        updated_at = now();
END;
$$;
