const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const Schema = mongoose.Schema;
const Comment = new Schema({
    author: String,
    content: String,
    date: String
});
const postSchema = new Schema({
    author: String,
    date: String,
    title: String,
    description: String,
    attachment: String,
    comments: [Comment]
    
});

module.exports = mongoose.model('posts', postSchema);