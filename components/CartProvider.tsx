import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

interface CartContextType {
  cartCount: number;
  addToCart: (productId: string) => Promise<boolean>;
  refreshCart: () => Promise<void>;
  decrementCart: () => void;
}

const CartContext = createContext<CartContextType>({
  cartCount: 0,
  addToCart: async () => false,
  refreshCart: async () => {},
  decrementCart: () => {},
});

export const useCart = () => useContext(CartContext);

export default function CartProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from("cart_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setCartCount(count || 0);
    } catch (err) {
      console.error("🛒 CartProvider refreshCart error:", err);
    }
  }, []);

  const addToCart = useCallback(
    async (productId: string): Promise<boolean> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return false;

        const { data: existing } = await supabase
          .from("cart_items")
          .select("id, quantity")
          .eq("user_id", user.id)
          .eq("product_id", productId)
          .single();

        if (existing) {
          await supabase
            .from("cart_items")
            .update({ quantity: existing.quantity + 1 })
            .eq("id", existing.id);
        } else {
          const { error } = await supabase.from("cart_items").insert({
            user_id: user.id,
            product_id: productId,
            quantity: 1,
          });
          if (error) return false;
        }

        setCartCount((prev) => prev + 1);
        return true;
      } catch (err) {
        console.error("🛒 CartProvider addToCart error:", err);
        return false;
      }
    },
    []
  );

  const decrementCart = useCallback(() => {
    setCartCount((prev) => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  return (
    <CartContext.Provider
      value={{ cartCount, addToCart, refreshCart, decrementCart }}
    >
      {children}
    </CartContext.Provider>
  );
}
