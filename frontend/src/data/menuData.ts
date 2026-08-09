import type { MenuCategory, MenuItem } from '@/types/restaurant'

const img = (seed: string) => `https://picsum.photos/seed/${seed}/400/300`

// ─── Categories ───────────────────────────────────────────────────────────────

export const MENU_CATEGORIES: MenuCategory[] = [
  { id: 'main',      name: 'Main Courses', emoji: '🍽️', description: 'Hearty meals & rice dishes',   sortOrder: 1 },
  { id: 'beverages', name: 'Cold Drinks',  emoji: '🥤', description: 'Fresh juices & soft drinks',   sortOrder: 2 },
  { id: 'coffee',    name: 'Coffee',       emoji: '☕', description: 'Hot & iced coffee drinks',     sortOrder: 3 },
  { id: 'tea',       name: 'Tea',          emoji: '🍵', description: 'Premium teas & infusions',     sortOrder: 4 },
  { id: 'soups',     name: 'Soups',        emoji: '🍲', description: 'Warm & hearty soups',          sortOrder: 5 },
  { id: 'salads',    name: 'Salads',       emoji: '🥗', description: 'Fresh & healthy salads',       sortOrder: 6 },
  { id: 'pizza',     name: 'Pizza',        emoji: '🍕', description: 'Stone-baked artisan pizza',    sortOrder: 7 },
  { id: 'burgers',   name: 'Burgers',      emoji: '🍔', description: 'Grilled burgers & wraps',      sortOrder: 8 },
  { id: 'desserts',  name: 'Desserts',     emoji: '🍰', description: 'Sweet treats & pastries',      sortOrder: 9 },
]

// ─── Menu Items ───────────────────────────────────────────────────────────────

export const MENU_ITEMS: MenuItem[] = [

  // ── Main Courses ────────────────────────────────────────────────────────────
  { id: 'm01', categoryId: 'main', name: 'Grilled Chicken',   description: 'Tender chicken breast with herb marinade, saffron rice & grilled vegetables',         price: 18, cost: 6.5,  image: img('grilledchicken'),  available: true,  preparationTime: 15, isPopular: true,  tags: ['gluten-free', 'popular'] },
  { id: 'm02', categoryId: 'main', name: 'Beef Biryani',      description: 'Slow-cooked aromatic basmati rice with tender beef, caramelized onions & spices',     price: 16, cost: 5.8,  image: img('beefbiryani'),     available: true,  preparationTime: 20, isPopular: true,  tags: ['spicy', 'popular']       },
  { id: 'm03', categoryId: 'main', name: 'Lamb Chops',        description: 'Marinated lamb chops grilled to perfection, mint yogurt & roasted potatoes',          price: 24, cost: 10.0, image: img('lambchops'),       available: true,  preparationTime: 18, isPopular: false, tags: ['premium']                },
  { id: 'm04', categoryId: 'main', name: 'Fish Fillet',       description: 'Pan-seared tilapia fillet, lemon butter sauce & steamed rice',                        price: 20, cost: 7.5,  image: img('fishfillet'),      available: true,  preparationTime: 15, isPopular: false, tags: ['seafood']                },
  { id: 'm05', categoryId: 'main', name: 'Pasta Carbonara',   description: 'Creamy pasta with crispy beef, parmesan, egg yolk & black pepper',                    price: 14, cost: 4.5,  image: img('pastacarbonara'),  available: true,  preparationTime: 12, isPopular: false, tags: []                         },
  { id: 'm06', categoryId: 'main', name: 'Veggie Rice Bowl',  description: 'Steamed basmati with sautéed seasonal vegetables, tahini & pomegranate seeds',        price: 12, cost: 3.5,  image: img('veggierice'),      available: true,  preparationTime: 10, isPopular: false, tags: ['vegetarian', 'healthy']  },

  // ── Cold Drinks ─────────────────────────────────────────────────────────────
  { id: 'b01', categoryId: 'beverages', name: 'Mango Smoothie',     description: 'Fresh Alphonso mangoes blended with yogurt, honey & cardamom',                  price: 6,  cost: 1.8,  image: img('mangosmoothie'),   available: true,  preparationTime: 5,  isPopular: true,  tags: ['popular', 'fresh']       },
  { id: 'b02', categoryId: 'beverages', name: 'Fresh Orange Juice', description: 'Freshly squeezed Valencia oranges, chilled with no added sugar',                price: 5,  cost: 1.5,  image: img('orangejuice'),     available: true,  preparationTime: 3,  isPopular: true,  tags: ['popular', 'vitamin-c']   },
  { id: 'b03', categoryId: 'beverages', name: 'Lemonade',           description: 'Hand-squeezed lemonade with fresh mint leaves & a pinch of salt',               price: 4,  cost: 1.0,  image: img('lemonade'),        available: true,  preparationTime: 3,  isPopular: false, tags: ['refreshing']             },
  { id: 'b04', categoryId: 'beverages', name: 'Watermelon Juice',   description: 'Cold-pressed watermelon blended smooth, served with fresh basil',               price: 5,  cost: 1.5,  image: img('watermelonjuice'), available: true,  preparationTime: 4,  isPopular: false, tags: ['seasonal']               },
  { id: 'b05', categoryId: 'beverages', name: 'Hibiscus Drink',     description: 'Traditional karkadeh — dried hibiscus steeped cold with honey',                 price: 4,  cost: 0.8,  image: img('hibiscus'),        available: true,  preparationTime: 2,  isPopular: false, tags: ['traditional']            },

  // ── Coffee ──────────────────────────────────────────────────────────────────
  { id: 'c01', categoryId: 'coffee', name: 'Espresso',         description: 'Single shot of rich espresso from premium Ethiopian Yirgacheffe beans',              price: 3,  cost: 0.8,  image: img('espresso'),        available: true,  preparationTime: 3,  isPopular: false, tags: ['strong']                 },
  { id: 'c02', categoryId: 'coffee', name: 'Cappuccino',       description: 'Equal parts espresso, steamed milk & velvety microfoam, dusted with cocoa',         price: 5,  cost: 1.2,  image: img('cappuccino'),      available: true,  preparationTime: 4,  isPopular: true,  tags: ['popular', 'creamy']      },
  { id: 'c03', categoryId: 'coffee', name: 'Camel Milk Latte', description: 'Our signature — rich espresso with locally sourced camel milk foam',                 price: 7,  cost: 2.5,  image: img('camellatte'),      available: true,  preparationTime: 5,  isPopular: true,  tags: ['signature', 'popular']   },
  { id: 'c04', categoryId: 'coffee', name: 'Americano',        description: 'Double espresso diluted with hot water to a smooth, bold finish',                    price: 4,  cost: 0.9,  image: img('americano'),       available: true,  preparationTime: 3,  isPopular: false, tags: ['strong']                 },
  { id: 'c05', categoryId: 'coffee', name: 'Iced Mocha',       description: 'Chilled espresso, chocolate syrup, cold milk over ice & whipped cream',             price: 7,  cost: 2.0,  image: img('icedmocha'),       available: true,  preparationTime: 5,  isPopular: false, tags: ['cold', 'sweet']          },

  // ── Tea ─────────────────────────────────────────────────────────────────────
  { id: 't01', categoryId: 'tea', name: 'Somali Spiced Tea', description: 'Traditional xawaash black tea with fresh ginger, cardamom & cloves',                   price: 3,  cost: 0.6,  image: img('somalitea'),       available: true,  preparationTime: 5,  isPopular: true,  tags: ['popular', 'traditional'] },
  { id: 't02', categoryId: 'tea', name: 'Green Tea',         description: 'Premium Japanese Sencha green tea, light & refreshing with floral notes',              price: 3,  cost: 0.5,  image: img('greentea'),        available: true,  preparationTime: 4,  isPopular: false, tags: ['healthy']                },
  { id: 't03', categoryId: 'tea', name: 'Mint Tea',          description: 'Moroccan-style fresh mint tea brewed with quality gunpowder green tea',                price: 4,  cost: 0.7,  image: img('minttea'),         available: true,  preparationTime: 5,  isPopular: false, tags: ['refreshing']             },
  { id: 't04', categoryId: 'tea', name: 'Masala Chai',       description: 'Black tea simmered with milk, cinnamon, cardamom, ginger & black pepper',             price: 4,  cost: 0.9,  image: img('masalachai'),      available: true,  preparationTime: 6,  isPopular: false, tags: ['spiced']                 },

  // ── Soups ────────────────────────────────────────────────────────────────────
  { id: 's01', categoryId: 'soups', name: 'Lentil Soup',       description: 'Slow-simmered red lentil soup with cumin, turmeric & fresh lemon, served with bread', price: 7, cost: 1.8, image: img('lentilsoup'),      available: true,  preparationTime: 8,  isPopular: true,  tags: ['popular', 'vegetarian'] },
  { id: 's02', categoryId: 'soups', name: 'Chicken Broth',     description: 'Clear golden chicken broth with vegetables, noodles & fresh parsley',                price: 8,  cost: 2.5,  image: img('chickensoup'),     available: true,  preparationTime: 8,  isPopular: false, tags: ['comforting']            },
  { id: 's03', categoryId: 'soups', name: 'Tomato Basil Soup', description: 'Roasted tomato soup with fresh basil, cream & extra-virgin olive oil',               price: 7,  cost: 1.5,  image: img('tomatosoup'),      available: true,  preparationTime: 7,  isPopular: false, tags: ['vegetarian']            },

  // ── Salads ───────────────────────────────────────────────────────────────────
  { id: 'sl1', categoryId: 'salads', name: 'Garden Salad', description: 'Mixed greens, cucumber, tomatoes, radish & carrots with house vinaigrette',               price: 8,  cost: 2.0,  image: img('gardensalad'),     available: true,  preparationTime: 5,  isPopular: false, tags: ['vegetarian', 'fresh']   },
  { id: 'sl2', categoryId: 'salads', name: 'Caesar Salad', description: 'Crisp romaine, parmesan shavings, house croutons & classic Caesar dressing',             price: 10, cost: 3.0,  image: img('caesarsalad'),     available: true,  preparationTime: 6,  isPopular: true,  tags: ['popular', 'classic']    },
  { id: 'sl3', categoryId: 'salads', name: 'Greek Salad',  description: 'Tomatoes, olives, feta cheese, cucumber & red onion with oregano & olive oil',           price: 9,  cost: 2.8,  image: img('greeksalad'),      available: true,  preparationTime: 5,  isPopular: false, tags: ['mediterranean']         },

  // ── Pizza ─────────────────────────────────────────────────────────────────────
  { id: 'p01', categoryId: 'pizza', name: 'Margherita',    description: 'San Marzano tomato base, buffalo mozzarella, fresh basil & extra-virgin oil',             price: 16, cost: 5.0,  image: img('margheritapizza'), available: true,  preparationTime: 15, isPopular: true,  tags: ['popular', 'vegetarian'] },
  { id: 'p02', categoryId: 'pizza', name: 'Pepperoni',     description: 'Generous spicy beef pepperoni over rich tomato sauce & melted mozzarella',                price: 19, cost: 6.5,  image: img('pepperonipizza'),  available: true,  preparationTime: 15, isPopular: true,  tags: ['popular', 'meat']       },
  { id: 'p03', categoryId: 'pizza', name: 'BBQ Chicken',   description: 'Grilled chicken, caramelized onions, peppers, BBQ sauce & smoked mozzarella',             price: 21, cost: 7.0,  image: img('bbqchicken'),      available: true,  preparationTime: 17, isPopular: false, tags: ['smoky', 'meat']         },
  { id: 'p04', categoryId: 'pizza', name: 'Veggie Supreme',description: 'Bell peppers, mushrooms, olives, spinach, sun-dried tomatoes & goat cheese',              price: 17, cost: 5.5,  image: img('veggiesupreme'),   available: true,  preparationTime: 15, isPopular: false, tags: ['vegetarian']            },

  // ── Burgers ──────────────────────────────────────────────────────────────────
  { id: 'bg1', categoryId: 'burgers', name: 'Classic Beef Burger', description: '180g prime beef patty, cheddar, lettuce, tomato, pickles & house sauce',         price: 14, cost: 4.5,  image: img('beefburger'),      available: true,  preparationTime: 12, isPopular: true,  tags: ['popular', 'classic']    },
  { id: 'bg2', categoryId: 'burgers', name: 'Crispy Chicken',      description: 'Buttermilk-fried chicken breast, slaw, jalapeño mayo & pickled cucumbers',        price: 13, cost: 4.0,  image: img('chickenburger'),   available: true,  preparationTime: 12, isPopular: false, tags: ['crispy']                },
  { id: 'bg3', categoryId: 'burgers', name: 'Shawarma Wrap',       description: 'Slow-roasted beef shawarma, garlic sauce, pickled turnips & tomatoes in flatbread', price: 12, cost: 3.5, image: img('shawarma'),        available: true,  preparationTime: 8,  isPopular: true,  tags: ['popular', 'traditional'] },
  { id: 'bg4', categoryId: 'burgers', name: 'Fish & Chips',        description: 'Beer-battered fish, triple-cooked chips, tartare sauce & mushy peas',              price: 15, cost: 5.0,  image: img('fishandchips'),    available: true,  preparationTime: 14, isPopular: false, tags: ['seafood']               },

  // ── Desserts ─────────────────────────────────────────────────────────────────
  { id: 'd01', categoryId: 'desserts', name: 'Chocolate Lava Cake', description: 'Warm dark chocolate molten cake, vanilla ice cream & raspberry coulis',          price: 9,  cost: 2.5,  image: img('chocolatecake'),   available: true,  preparationTime: 10, isPopular: true,  tags: ['popular', 'warm']       },
  { id: 'd02', categoryId: 'desserts', name: 'Baklava Platter',     description: 'Assorted honey-soaked baklava with pistachios, walnuts & rose water syrup',      price: 8,  cost: 2.0,  image: img('baklava'),         available: true,  preparationTime: 3,  isPopular: true,  tags: ['popular', 'traditional'] },
  { id: 'd03', categoryId: 'desserts', name: 'Crème Brûlée',        description: 'Classic French vanilla custard with caramelized sugar crust & fresh berries',    price: 9,  cost: 2.5,  image: img('cremebrulee'),     available: true,  preparationTime: 5,  isPopular: false, tags: ['french']                },
  { id: 'd04', categoryId: 'desserts', name: 'Ice Cream Trio',      description: 'Three scoops: vanilla bean, mango sorbet & pistachio with waffle crumble',       price: 7,  cost: 1.8,  image: img('icecream'),        available: true,  preparationTime: 3,  isPopular: false, tags: ['cold']                  },
]