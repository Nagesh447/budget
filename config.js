// Fill these two lines from Supabase -> Project Settings -> API.
// The anon / publishable key is public by design (Row Level Security protects the data).
// NEVER put the service_role / secret key here.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-OR-PUBLISHABLE-KEY",

  CURRENCY: "USD",
  LOCALE: "en-US",

  // essential:false items get the "make it difficult" nudges when over budget.
  CATEGORIES: [
    { name: "Groceries",      icon: "🛒", essential: true  },
    { name: "Rent/Mortgage",  icon: "🏠", essential: true  },
    { name: "Utilities",      icon: "💡", essential: true  },
    { name: "Gas/Transport",  icon: "⛽", essential: true  },
    { name: "Health",         icon: "💊", essential: true  },
    { name: "Dining out",     icon: "🍽️", essential: false },
    { name: "Coffee/Snacks",  icon: "☕", essential: false },
    { name: "Shopping",       icon: "🛍️", essential: false },
    { name: "Subscriptions",  icon: "📺", essential: false },
    { name: "Entertainment",  icon: "🎟️", essential: false },
    { name: "Travel",         icon: "✈️", essential: false },
    { name: "Gifts",          icon: "🎁", essential: false },
    { name: "Home",           icon: "🧰", essential: false },
    { name: "Other",          icon: "📦", essential: false }
  ]
};
