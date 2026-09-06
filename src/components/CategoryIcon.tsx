import React from 'react';
import { View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  categoryName: string;
  iconName: string;
  color?: string;
  size?: number;
  style?: any;
}

const ONLINE_ICONS: Record<string, string> = {
  Food: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Hamburger.png',
  Groceries: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Shopping%20Cart.png',
  Dining: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Pizza.png',
  Coffee: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Hot%20Beverage.png',
  Travel: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Airplane.png',
  Fuel: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Fuel%20Pump.png',
  Shopping: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Shopping%20Bags.png',
  Rent: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/House.png',
  Bills: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Receipt.png',
  Utilities: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Light%20Bulb.png',
  EMI: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Credit%20Card.png',
  Entertainment: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Clapper%20Board.png',
  Subscriptions: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Television.png',
  Healthcare: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Hospital.png',
  Education: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Graduation%20Cap.png',
  Fitness: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20gestures/Flexed%20Biceps%20Dark%20Skin%20Tone.png',
  Savings: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Coin.png',
  'Pocket Money': 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Dollar%20Banknote.png',
  Friend: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20gestures/Handshake.png',
  Job: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Briefcase.png',
  Income: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20Bag.png',
  Salary: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Briefcase.png',
  Business: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Chart%20Increasing.png',
  Freelance: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Laptop.png',
  Investments: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Bar%20Chart.png',
  Investment: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Bar%20Chart.png',
  Cashback: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Wrapped%20Gift.png',
  Rental: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/House.png',
  Bonus: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Trophy.png',
  Dividends: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Coin.png',
  Dividend: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Coin.png',
  Interest: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Money%20with%20Wings.png',
  Gift: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Wrapped%20Gift.png',
};

const ICON_NAME_IMAGES: Record<string, string> = {
  'ice-cream': 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Ice%20Cream.png',
  cupcake: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Cupcake.png',
  donut: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Doughnut.png',
  cookie: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Cookie.png',
  candy: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Candy.png',
  cake: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Birthday%20Cake.png',
  lollipop: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Lollipop.png',
  chocolate: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Chocolate%20Bar.png',
  pancakes: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Pancakes.png',
  popcorn: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Popcorn.png',
  strawberry: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Strawberry.png',
  watermelon: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Watermelon.png',
  banana: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Banana.png',
  apple: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Red%20Apple.png',
  smoking: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Cigarette.png',
  eating: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Fork%20and%20Knife%20with%20Plate.png',
  alcohol: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Clinking%20Glasses.png',
  medicine: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Pill.png',
  pet: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Dog%20Face.png',
  baby: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Baby.png',
  beauty: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Lipstick.png',
  electronics: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Mobile%20Phone.png',
  internet: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Satellite%20Antenna.png',
  parking: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Parking.png',
  sports: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Soccer%20Ball.png',
  cinema: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Clapper%20Board.png',
  books: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Books.png',
  charity: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Red%20Heart.png',
  laundry: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Soap.png',
  rose: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Plants/Rose.png',
  nurse: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Health%20Worker.png',
  'heart-gift': 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Wrapped%20Gift.png',
  'heart-shopping': 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Shopping%20Bags.png',
  eggs: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Food/Egg.png',
};

const ICON_FALLBACKS: Record<string, string> = {
  'ice-cream': 'ice-cream-outline',
  cupcake: 'fast-food-outline',
  donut: 'ellipse-outline',
  cookie: 'disc-outline',
  candy: 'sparkles-outline',
  cake: 'gift-outline',
  lollipop: 'color-wand-outline',
  chocolate: 'rectangle-outline',
  pancakes: 'restaurant-outline',
  popcorn: 'film-outline',
  strawberry: 'heart-outline',
  watermelon: 'ellipse-outline',
  banana: 'leaf-outline',
  apple: 'nutrition-outline',
  smoking: 'ban-outline',
  eating: 'restaurant-outline',
  alcohol: 'wine-outline',
  medicine: 'medkit-outline',
  pet: 'paw-outline',
  baby: 'happy-outline',
  beauty: 'color-palette-outline',
  electronics: 'phone-portrait-outline',
  internet: 'wifi-outline',
  parking: 'car-outline',
  sports: 'football-outline',
  cinema: 'film-outline',
  books: 'book-outline',
  charity: 'heart-outline',
  laundry: 'shirt-outline',
  rose: 'flower-outline',
  nurse: 'medkit-outline',
  'heart-gift': 'gift-outline',
  'heart-shopping': 'bag-heart-outline',
  eggs: 'egg-outline',
};

export default function CategoryIcon({ categoryName, iconName, color = '#6B7280', size = 16, style }: Props) {
  const [imageError, setImageError] = React.useState(false);

  // Case-insensitive match for category name
  const normalizedCat = (categoryName || '').trim().toLowerCase();
  const key = Object.keys(ONLINE_ICONS).find(k => k.toLowerCase() === normalizedCat);
  const imageUrl = ICON_NAME_IMAGES[iconName] || (key ? ONLINE_ICONS[key] : null);

  if (imageUrl && !imageError) {
    return (
      <ExpoImage
        source={{ uri: imageUrl }}
        style={[{ width: size * 1.25, height: size * 1.25 }, style]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setImageError(true)}
      />
    );
  }

  // Fallback to Ionicons for custom categories or if image fails to load
  return <Ionicons name={(ICON_FALLBACKS[iconName] || iconName) as any} size={size} color={color} style={style} />;
}
