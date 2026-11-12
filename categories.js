// Categories live here (not in config.js) so app updates never touch your keys.
// essential:false items get the "make it difficult" nudges when over budget.
// Renaming a category later leaves old entries under the old name.
window.BUDGET_CATEGORIES = [
  { group: "Home & essentials", name: "Groceries",      icon: "🛒", essential: true  },
  { group: "Home & essentials", name: "Rent/Mortgage",  icon: "🏠", essential: true  },
  { group: "Home & essentials", name: "Utilities",      icon: "💡", essential: true  },
  { group: "Home & essentials", name: "Gas/Transport",  icon: "⛽", essential: true  },
  { group: "Home & essentials", name: "Health",         icon: "💊", essential: true  },
  { group: "Home & essentials", name: "Home",           icon: "🧰", essential: false },

  { group: "Kids", name: "Kids: Diapers & wipes",       short: "Diapers & wipes",      icon: "🧷", essential: true  },
  { group: "Kids", name: "Kids: Formula & baby food",   short: "Formula & baby food",  icon: "🍼", essential: true  },
  { group: "Kids", name: "Kids: Clothes & shoes",       short: "Clothes & shoes",      icon: "👕", essential: true  },
  { group: "Kids", name: "Kids: Daycare & babysitting", short: "Daycare & babysitting", icon: "👶", essential: true  },
  { group: "Kids", name: "Kids: School & supplies",     short: "School & supplies",    icon: "🎒", essential: true  },
  { group: "Kids", name: "Kids: Health & medicine",     short: "Health & medicine",    icon: "🩺", essential: true  },
  { group: "Kids", name: "Kids: Baby gear",             short: "Baby gear",            icon: "🚼", essential: true  },
  { group: "Kids", name: "Kids: Toys & books",          short: "Toys & books",         icon: "🧸", essential: false },
  { group: "Kids", name: "Kids: Activities & classes",  short: "Activities & classes", icon: "⚽", essential: false },
  { group: "Kids", name: "Kids: Snacks & treats",       short: "Snacks & treats",      icon: "🍭", essential: false },
  { group: "Kids", name: "Kids: Birthdays & parties",   short: "Birthdays & parties",  icon: "🎈", essential: false },

  { group: "Lifestyle", name: "Dining out",     icon: "🍽️", essential: false },
  { group: "Lifestyle", name: "Coffee/Snacks",  icon: "☕", essential: false },
  { group: "Lifestyle", name: "Shopping",       icon: "🛍️", essential: false },
  { group: "Lifestyle", name: "Subscriptions",  icon: "📺", essential: false },
  { group: "Lifestyle", name: "Entertainment",  icon: "🎟️", essential: false },
  { group: "Lifestyle", name: "Travel",         icon: "✈️", essential: false },
  { group: "Lifestyle", name: "Gifts",          icon: "🎁", essential: false },
  { group: "Lifestyle", name: "Other",          icon: "📦", essential: false }
];
