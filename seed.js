require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Mongoose Models Import
const User = require('./models/User');
const LawCategory = require('./models/LawCategory');
const Law = require('./models/Law');
const Post = require('./models/Post');

const lawyers = [
  {
    firstName: 'Ahmed', lastName: 'Khan',
    name: 'Ahmed Khan', // Schema validation strictness setup
    email: 'ahmed@lawmate.pk', phone: '03001234567',
    barNumber: 'KHI-12345', barCouncil: 'Karachi Bar Council',
    specialization: 'Family Law', yearsExp: 12,
    rating: 4.9, reviewCount: 148, consultationFee: 3000,
    city: 'Karachi', languages: ['English', 'Urdu'],
    casesHandled: 320, isAvailable: true,
    bio: 'Senior advocate with 12+ years in family and civil law.',
    role: 'lawyer', username: 'ahmed_khan'
  }
];

const lawCategories = [
  { name: 'Family Law', nameUrdu: 'خاندانی قانون', icon: '👨‍👩‍👧', color: '#4A90E2', lawCount: 1 }
];

const laws = [
  {
    title: 'Khula (Wife-Initiated Divorce)',
    titleUrdu: 'خلع',
    description: 'Khula is the right of a Muslim wife to seek dissolution of her marriage through a court of law.',
    descriptionUrdu: 'خلع ایک مسلمان بیوی کا حق ہے۔',
    keyPoints: ['Wife can initiate divorce proceedings', 'Court involvement is mandatory'],
    examples: ['A wife facing domestic abuse can file for Khula'],
    relatedLaws: ['Talaq', 'Mehr']
  }
];

async function seed() {
  try {
    // 1. MongoDB Atlas Cloud Connection setup
    const dbUri = process.env.MONGO_URI;
    if (!dbUri) {
      console.error("❌ Error: MONGO_URI is missing in your .env file!");
      process.exit(1);
    }
    await mongoose.connect(dbUri);
    console.log('◇ Connected to MongoDB Atlas for seeding...');

    // 2. Clear old collection states (Fresh Reset)
    await User.deleteMany({});
    await LawCategory.deleteMany({});
    await Law.deleteMany({});
    await Post.deleteMany({});
    console.log('🗑️ Cleaned all old collections.');

    const passwordHash = await bcrypt.hash('password123', 10);
    
    // 3. Seed Users
    const ahmed = await User.create({ ...lawyers[0], password: passwordHash });
    console.log('👤 Lawyer seeded.');

    // 4. Seed Categories
    const familyCat = await LawCategory.create(lawCategories[0]);
    console.log('📂 Law Category seeded.');

    // 5. Seed Laws (Using MongoDB object `_id`)
    await Law.create({ ...laws[0], categoryId: familyCat._id });
    console.log('📜 Law details seeded.');

    // 6. Seed Posts (Fixed schema keys mapping validation)
    await Post.create({
      userId: ahmed._id,                     // Matches schema requirement
      title: 'Supreme Court New Guidelines', // Added missing required field
      authorName: 'Ahmed Khan',
      authorRole: 'lawyer',
      content: 'Important: The Supreme Court has issued new guidelines regarding family court procedures.',
      likes: [],                             // Fallback mapping safe schema state
      comments: 10,
      tag: 'Legal'
    });
    console.log('📝 Community Post seeded.');

    console.log('🎉 Database seeded successfully with real layout parameters!');
    
    // Connection release clean up
    mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding DB:', err.message);
    process.exit(1);
  }
}

seed();