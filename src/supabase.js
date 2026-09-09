import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lzmnrbbprvjkaluiyrlm.supabase.co'
const SUPABASE_KEY = 'sb_publishable_XckM8IaFMfFbrh4bhOy7mA_b9Nm_fTp'

// Supabase 单例，全应用共用同一个客户端
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
