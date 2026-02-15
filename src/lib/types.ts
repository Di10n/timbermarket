export interface Profile {
  id: string;
  username: string;
  balance: number;
  is_approved: boolean;
  is_admin: boolean;
  phone_number: string | null;
  created_at: string;
}

export interface Market {
  id: string;
  question: string;
  description: string | null;
  creator_id: string;
  pool_yes: number;
  pool_no: number;
  p: number;
  probability: number;
  total_liquidity: number;
  volume: number;
  status: "active" | "resolved" | "cancelled";
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  is_featured?: boolean;
}

export interface Trade {
  id: string;
  market_id: string;
  user_id: string;
  type: "BUY" | "SELL" | "REDEEM";
  outcome: "YES" | "NO";
  amount: number;
  shares: number;
  prob_before: number;
  prob_after: number;
  is_rolled_back: boolean;
  created_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  market_id: string;
  yes_shares: number;
  no_shares: number;
  total_invested: number;
}

export interface TradeWithMarket extends Trade {
  markets: Pick<Market, "question" | "probability" | "status">;
}

export interface PositionWithMarket extends Position {
  markets: Pick<Market, "question" | "probability" | "status" | "resolution">;
}

export interface Comment {
  id: string;
  market_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface CommentWithProfile extends Comment {
  profiles: Pick<Profile, "username">;
  positions?: Pick<Position, "yes_shares" | "no_shares"> | null;
}

export interface MarketIdea {
  id: string;
  user_id: string;
  question: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}
