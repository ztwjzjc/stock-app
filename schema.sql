-- ============================================================
-- 价值投资分析器 - Supabase 数据库 Schema
-- 在 Supabase Dashboard > SQL Editor 中执行此文件
-- ============================================================

-- 1. 自选股表
CREATE TABLE IF NOT EXISTS public.watchlist (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    code        TEXT NOT NULL,                    -- 股票代码
    name        TEXT NOT NULL,                    -- 股票名称
    score       INTEGER DEFAULT 0,                -- 综合评分
    conclusion  TEXT DEFAULT '',                  -- 投资结论
    current_price  DOUBLE PRECISION,             -- 当前价格
    fair_price     DOUBLE PRECISION,             -- 合理价格
    safety_margin_pct DOUBLE PRECISION,          -- 安全边际百分比
    action         TEXT DEFAULT '—',             -- 操作建议
    data           JSONB DEFAULT '{}'::jsonb,    -- 完整分析数据
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, code)                        -- 每个用户每只股票只存一条
);

-- 2. 用户设置表
CREATE TABLE IF NOT EXISTS public.user_settings (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    settings    JSONB DEFAULT '{}'::jsonb,       -- 用户偏好设置
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. 自动更新 updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER watchlist_updated_at
    BEFORE UPDATE ON public.watchlist
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Row Level Security (RLS) - 用户只能访问自己的数据
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 自选股策略
CREATE POLICY "用户查看自己的自选股"
    ON public.watchlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "用户添加自己的自选股"
    ON public.watchlist FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户修改自己的自选股"
    ON public.watchlist FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户删除自己的自选股"
    ON public.watchlist FOR DELETE
    USING (auth.uid() = user_id);

-- 用户设置策略
CREATE POLICY "用户查看自己的设置"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "用户修改自己的设置"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户更新自己的设置"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. 启用 Realtime（用于跨设备实时同步）
ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlist;

-- ============================================================
-- 执行完毕。现在可以在应用中填入 Supabase URL 和 anon key。
-- ============================================================
