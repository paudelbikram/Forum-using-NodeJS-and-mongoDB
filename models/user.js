const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
mongoose.Promise = global.Promise;

const userSchema = mongoose.Schema({
    email: {
        type: String, required: true, trim: true, unique: true
    },
    password: {
        type: String, required: true, minlength: 5
    },
    firstname:{
        type: String, required: false
    },
    lastname:{
        type: String, required: false
    },
    image:{
        type: String, required: false
    },
    role: {
        type: String, enum: ['normaluser', 'admin'], default: 'normaluser'
    }
});

userSchema.methods.encryptPassword = function(password, callback) {
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return callback(err);
        else return callback(null, hash);
    });
}

userSchema.methods.verifyPassword = function(password, callback) {
    bcrypt.compare(password, this.password, (err, result) => {
        if (err) return callback(err);
        return callback(null, result);
    });
}

module.exports = mongoose.model('users', userSchema);