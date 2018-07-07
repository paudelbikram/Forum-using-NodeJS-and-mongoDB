const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const app = express();
const nodemailer = require('nodemailer');
const session = require('express-session');
const csrf = require('csurf');
const multer = require('multer');
const ejs = require('ejs');
const path= require('path');
const fs = require('fs');
const moment = require('moment');
const linkifyUrls = require('linkify-urls');
const uploadImagePrefix ='image-';
const uploadDir ='./public/uploads';

const storageOptions = multer.diskStorage({
    destination: (req, file, callback) => {
        // upload dir path
        callback(null, uploadDir);
    },
    filename: (req, file, callback) => {
        callback(null, uploadImagePrefix + Date.now()
            + path.extname(file.originalname));
    }
});
// configure multer
const MAX_FILESIZE = 1024 * 1024 * 10; 
const fileTypes = /jpeg|jpg|png|gif/; // accepted file types in regexp


app.use('/public', express.static(__dirname + '/public'));
//flash: to store messages in session
const flash = require('connect-flash');
//morgan: to log every request
//const morgan = require('morgan'); //took it off because to hard to see my console 
app.use(session({
	secret: 'mysecretekey',
	saveUninitialized: false,
	resave: false,
	cookie: {maxAge: 60*60*1000} // unit: ms, session expires in 1 hour
}));
const transporter = nodemailer.createTransport({
	service:'gmail',
	auth:{
		user:'cs.connect.service@gmail.com',
		pass:'csconnectservice'
	}
});
app.set('view engine', 'ejs');
app.set('views', './views');
app.use(cookieParser());
const upload = multer({
    storage: storageOptions,
    limits: {
        fileSize: MAX_FILESIZE
    }, 
    fileFilter: (req, file, callback) => {
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (mimetype && extname) {
            return callback(null, true);
        } else {
            return callback('Error: Images only');
        }
    }
}).single('imageUpload'); // parameter name at <form> of index.ejs
app.use(express.urlencoded( {extended: false} ));
//app.use(morgan('dev')); //log every request to the console//to hard because hard to see my console

app.use(flash()); //to use flash messages stored in session
app.use(passport.initialize());
app.use(passport.session()); //for persistent login sessions
//protection against cross site request forgery
//csrf() must be set after cookieparser and session
app.use(csrf());
app.locals.moment = moment; // this makes moment available as a variable in all EJS page

// run and connect to the database
require('./models/database');

require('./config/passport');
const User = require('./models/user');
const Post = require('./models/post');

app.get('/',(req, res) =>{
	const errormessage = req.flash('loginerror');
	const successmessage = req.flash('signupsuccess');
	console.log('successmessage',successmessage);
	console.log('errormessage',errormessage);
	res.render('welcome',{req, csrfToken: req.csrfToken(), successmessage, errormessage});
})
app.get('/signin',(req, res)=>{
	const successmessage = req.flash('signupsuccess');
	const errormessage = req.flash('loginerror');
	console.log('successmessage',successmessage);
	console.log('errormessage',errormessage);
	res.render('welcome',{req, csrfToken: req.csrfToken(), successmessage, errormessage});
})
app.get('/verify',(req, res)=>{
	res.render('verify', {req, csrfToken: req.csrfToken()});
})
app.post('/verify',(req, res) =>{
	let referenceNumber = Math.floor((Math.random() * 100000) + 1);
	console.log(referenceNumber);
	theirEmail = req.body.email;
	console.log(theirEmail);
	let mailOptions ={
		from:'cs.connect.service@gmail.com',
		to: theirEmail,
		subject:'Verify your email in order to sign up at CS-Conncet',
		text: referenceNumber+' is your verification code. Please go back enter the code to verify'
	}
	let userinfo ={
		email: theirEmail,
		code: referenceNumber
	};
	req.session.verification = userinfo;
	transporter.sendMail(mailOptions, function(error, info){
		if(error){
			console.log(error);		
		}else {
			console.log('Email sent: '+info.response);
		}
		res.render('signup',{error,theirEmail, verificationerror:null,});
	});
} )

app.get('/signup', (req, res) =>{
	const messages = req.flash('signuperror');
	const verification = req.session.verification;
	const verificationerror="Verification failed: Verification code didn't match."
	if((verification.email==req.query.email)&&(verification.code==req.query.verificationcode)){
		const theirEmail =req.query.email;
		console.log('VERIFIED');
		res.render('createaccount',{theirEmail, csrfToken: req.csrfToken(), messages});
	}
	else{
		console.log('VERIFICATION FAILED');
		res.render('signup',{verificationerror, error:null,});
	}	
	
	console.log('VERIFICATION', req.session.verification);
});

app.post('/signup', passport.authenticate('localsignup', {
    successRedirect: '/signin',
    failureRedirect: 'back',
    failureFlash: true
}));

app.post('/verifylogin',passport.authenticate('locallogin',{
	successRedirect: '/userhome',
    failureRedirect: '/signin',
    failureFlash: true
}));


app.get('/userhome', isLoggedIn, (req, res) => {
	console.log('very first req.user', req.user);
	Post.find({}, (err, results) => {
		if (err) {
			return res.render.status(500).send('<h1>Error</h1>');
        }
		
		return res.render('userhome', {user: req.user,results, Post, csrfToken: req.csrfToken()});
	});
});

app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/userhome');
});

app.get('/myprofile', (req, res) => {
	console.log('req.user befor entering to my profile',req.user);
	const query = {_id: req.user._id};
	User.findOne(query, function(error, response){
		if(error){
			console.log(error);
		}
		console.log('response', response);
		res.render('myprofile',{user: response, csrfToken: req.csrfToken()});
	});
	
});

app.post('/updateuser', (req, res) => {
    let newFile = true; //Assuming the user will always update a file at first
    upload(req, res, (err) => {
        if (err) {
			console.log("Error occured in uploading file")
			console.log(err);
		}
		console.log('REQ FILE', req.file);
        if (!req.file) {
            newFile = false;   //Looks like user wants to keep the old file, should have used try catch.           
            
        }
        
        
        const query = {_id: req.user._id};
        //Based on the new file is choosen or not, deciding which path to push into database. 
		let fileToUpload;
		let oldPath = req.body.filename;
		console.log("OLD PATH", oldPath);
        if(newFile){
            fileToUpload = req.file.filename;
            
        }
        else{
            //oldPath is whole path not just a file name. So, slicing to get just a filename.
			console.log('oldpath', oldPath);
			fileToUpload= oldPath.slice(oldPath.lastIndexOf('/'),);
			console.log('fileToUpload', fileToUpload);
            
            
		}
		let value;
		if((oldPath=='')&&(!newFile)){
			value = {
				$set: {
					firstname: req.body.firstname,
					lastname: req.body.lastname,
				}
			};
		}else{
			value = {
		    	$set: {
					firstname: req.body.firstname,
					lastname: req.body.lastname,
					image:  uploadDir +'/'+ fileToUpload
               
		    	}
			};
		
		}
        //Since we only need to delete file if newFile is choosen
        if(((newFile && oldPath) && (oldPath!='') ) ){
            fs.unlink(req.body.filename, (err) => {
                if (err) {
                    // what should I do?
                    throw err;
                }
            });
        }
        
	    User.findOneAndUpdate(query, value, (err, results) => {
		    if (err) {
			    return res.status(500).send('<h1>Update Error</h1>');
            }
			console.log('result while updating', results);
			console.log('USER FROM UPDATE', req.user)
		    return res.redirect('/userhome');
        });
    });
});

app.post('/remove', (req, res) => {
	Post.remove({_id: req.body.postid}, (err, results) => {
		if (err) {
			return res.status(500).send('<h1>Remove post error. Try again</h1>');
        }
		return res.redirect('/userhome');
	});
});



app.post('/post', (req, res)=>{
	let dateandtimeutc = moment.utc(Date.now());
	console.log('date', dateandtimeutc);
	let descriptionwithurls = linkifyUrls(req.body.description, {
	});
	const newPost = new Post({
		author: req.body.useremail,
		title: req.body.title,
		date: dateandtimeutc,
		description: descriptionwithurls
		
	});
	newPost.save((err,results)=>{
		if(err){
			return res.status(500).send('<h1>save() error</h1>', err);
		}
	});
	console.log("USER ROLE",req.body.userrole);
	if(req.body.userrole=="admin"){
		let emaillist=[];
		User.find({}, (err, results) => {
			if (err) {
				return res.render.status(500).send('<h1>Error</h1>');
			}
			console.log("RESULTS", results);
			for(let i=0; i< results.length; i++){
				emaillist.push(results[i].email);
			}
			console.log(emaillist);
		});
		let mailOptions ={
			from:'cs.connect.service@gmail.com',
			to: emaillist,
			subject: newPost.author+" has recently posted on CS-CONNECT",
			text: newPost.author+ ' has recently posted "'+newPost.title+ '" on CS-CONNECT page. Please log on to CS-CONNECT page to see more details about the post.'
		}
		transporter.sendMail(mailOptions, function(error, info){
			if(error){
				console.log(error);		
			}else {
				console.log('Email sent: '+info.response);
			}
				
		});
	}
	return res.redirect('/userhome');

});

app.get('/search', isVisitor, (req, res)=>{
	let searchstring = req.query.searchstring;
	let searchstringlower = searchstring.toLowerCase();
	let searchstringarray =searchstringlower.split(" ");
	console.log(searchstringarray);
	Post.find({}, (err, results) => {
		if (err) {
			return res.render.status(500).send('<h1>Error</h1>');
		}
		let searchedpost = searchandsort(results, searchstringarray);
		let minimumweight = getmaxweight(searchedpost);
		console.log("MAX", minimumweight);
		return res.render('searchpage',{user: req.user,searchedpost,Post, minimumweight, csrfToken: req.csrfToken()});
	});


});

app.post('/reply', (req, res) => {
	const query = {_id: req.body.postid};
	console.log(query);
	let text='';
	text= req.body.content;
	let formattedreply='';
	formattedreply = text.replace(/\n/g,"<br>");
	let reply = linkifyUrls(formattedreply, {
	});
	const newComment = {
		author: req.body.useremail,
		content: reply
		//content: req.body.content
	};
	console.log(newComment);
	
	Post.findOneAndUpdate(query, {$push: {comments: newComment}}, (err, results) => {
		    if (err) {
			    return res.status(500).send('<h1>Reply Error</h1>');
            }
			console.log('result while updating', results);
			console.log('USER FROM UPDATE', req.user)
			
			return res.redirect('/userhome');
		    
    });
});



function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
		
		Post.find({}, (err, results) => {
			if (err) {
				return res.render.status(500).send('<h1>Error</h1>');
			}
			
			return res.render('unregistered', {results, Post, csrfToken: req.csrfToken()});
		});
     
    }
}

function isVisitor(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    } else {
		let searchstring = req.query.searchstring;
		let searchstringlower = searchstring.toLowerCase();
		let searchstringarray =searchstringlower.split(" ");
		Post.find({}, (err, results) => {
			if (err) {
				return res.render.status(500).send('<h1>Error</h1>');
			}
			let searchedpost = searchandsort(results, searchstringarray);
			let minimumweight = getmaxweight(searchedpost);
			console.log("MAX", minimumweight);
			return res.render('searchpageforvisitor',{searchedpost,Post, minimumweight, csrfToken: req.csrfToken()});
		});
     
    }
}
//This function will return true if 2nd array is subset of 1st array.
function isSubset(superset, subset){
	//Return false immediately if 2nd array has nothing in it.
	if(subset.length ==0){
		return false;
	}
	//traverse through each element(value) of 2nd array using function
	return subset.every( function(x){
		//return true if value(element in 2nd array) is in 1st array.
		return (superset.indexOf(x) >=0);
	});
}
//This function returns the elements in first array if there is match to that element in second array.
function commonelements(first, second){
	return first.filter(function(x){
		return second.indexOf(x) >=0;
	});
}

//This function takes an array of words as a searchstringarray and finds the post in results
//and sort them based on searchstringarray.
function searchandsort(results, searchstringarray){
	let searchedpost=[];
	for(let post of results){
		post['weight']=0;

		//searching through title
		let titlestring = post.title.toLowerCase();
		let titlestringarray = titlestring.split(" ");
		if(isSubset(searchstringarray, titlestringarray)){
			post.weight += 10;
		}
		let numberofcommonelements = commonelements(titlestringarray, searchstringarray).length;
		post.weight += numberofcommonelements;

		//searching through description 
		let descriptionstring = post.description.toLowerCase();
		let descriptionarray = descriptionstring.split(" ");
		if(isSubset(searchstringarray, descriptionarray)){
			post.weight +=5;
		}
		let commondescription = commonelements(descriptionarray, searchstringarray).length;
		post.weight += (commondescription * 0.75);

		//searching through comments
		for(const comment of post.comments){
			let commentstring = comment.content.toLowerCase();
			let commentarray = commentstring.split(" ");
			if(isSubset(searchstringarray, commentarray)){
				post.weight += 1;
			}
			let commoncomment = commonelements(commentarray, searchstringarray).length;
			post.weight += (commoncomment * 0.05);
		}
		searchedpost.push(post);
		console.log(post.title, ":", post.weight);
	}
	
	searchedpost.sort(function(post1, post2){
		if(post1.weight>post2.weight){
			return -1;
		}else{
			return 1;
		}
	});

	return searchedpost;
}

function getmaxweight(searchedpost){
	let weightarray=[];
	for(const post of searchedpost){
		weightarray.push(post.weight);
	}
	return weightarray.reduce(function(a, b){
		return Math.max(a, b);
	});
}

const port = process.env.PORT || 3000;
app.listen(port, ()=> {
	console.log('Server started at port', port);
});