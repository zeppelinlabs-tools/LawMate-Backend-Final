const Law = require('../models/Law');
const LawCategory = require('../models/LawCategory');

// 1. GET ALL LAW CATEGORIES
exports.getCategories = async (req, res) => {
  try {
    // Sequelize `.findAll()` becomes Mongoose `.find()`
    const categories = await LawCategory.find();
    res.json(categories);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// 2. GET ALL LAWS (With Optional Category Filter & Join)
exports.getLaws = async (req, res) => {
  try {
    const { categoryId, region } = req.query;
    let queryClause = {};

    // Agar query mein categoryId aati hai toh direct assignment
    if (categoryId) {
      queryClause.categoryId = categoryId;
    }

    // Region filter — "pakistan" means nationwide, so we don't filter at all
    // (it should show every law, not just ones explicitly tagged "pakistan").
    if (region && region !== 'pakistan') {
      queryClause.region = region;
    }

    // `.findAll({ where: ... , include: [...] })` is replaced by `.find(...)` and `.populate(...)`
    const laws = await Law.find(queryClause)
      .populate('categoryId'); // Assuming your Law schema has categoryId with `ref: 'LawCategory'`
      
    res.json(laws);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

// 3. GET SINGLE LAW BY ID
exports.getLawById = async (req, res) => {
  try {
    // Sequelize `findByPk` becomes Mongoose `findById`
    const law = await Law.findById(req.params.id)
      .populate('categoryId');
      
    if (!law) return res.status(404).json({ msg: 'Law not found' });
    res.json(law);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
