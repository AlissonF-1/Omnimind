CREATE OR REPLACE FUNCTION increment_study_log(p_user_id UUID, p_topic TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO daily_study_logs (user_id, study_date, review_count, topics)
    VALUES (
        p_user_id,
        current_date,
        1,
        CASE WHEN p_topic IS NOT NULL THEN ARRAY[p_topic] ELSE '{}'::TEXT[] END
    )
    ON CONFLICT (user_id, study_date)
    DO UPDATE SET 
        review_count = daily_study_logs.review_count + 1,
        topics = CASE 
                    WHEN p_topic IS NOT NULL AND NOT (p_topic = ANY(COALESCE(daily_study_logs.topics, '{}'::text[]))) 
                    THEN array_append(COALESCE(daily_study_logs.topics, '{}'::text[]), p_topic)
                    ELSE COALESCE(daily_study_logs.topics, '{}'::text[])
                 END,
        updated_at = now();
END;
$$;
