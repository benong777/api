const express = require('express');
const jsonwebtoken = require('jsonwebtoken');
const bcrypt = require('bcrypt');
//const { genSaltSync, hashSync, hash, compareSync } = require('bcrypt');
const mysql = require('mysql2/promise');
const app = express();

require('dotenv').config();
const port = process.env.PORT;
const JWT_KEY = process.env.JWT_KEY;

//-- Middleware
app.use(express.json());

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jsonwebtoken.verify(token, JWT_KEY, (error, user) => {
            if (error) {
              return res.sendStatus(403);
            }
            req.user = user;
            next();
        });
    } else {
      res.sendStatus(401);
    }
};


//-- Connect to the database
app.use(async (req, res, next) => {
    global.db = await mysql.createConnection({ 
      host: process.env.DB_HOST, 
      user: process.env.DB_USER, 
      password: process.env.DB_PASSWORD, 
      database: process.env.DB_NAME, 
    });

    global.db.query(`SET time_zone = '-8:00'`);
    await next();
});

//-- LOGIN
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(email, password);

    //-- Filter user from the users array by username and password
    const [[user]] = await global.db.query(
                                  'SELECT * FROM users WHERE email=?',
                                  [email]
    );

    if (user) {
      console.log("Got user info: ", user);
      bcrypt.compare(password, user.password, function(err, compareResult) {
        console.log(compareResult);
        if (compareResult == true) {
          console.log("Password matched");
          //-- Generate an access token
          const token = jsonwebtoken.sign({ id: user.user_id, email: user.email },
            JWT_KEY);
            res.json({ jwt: token });
        }
        else {
          res.send('Password incorrect');
        }
      });
    } 
    else {
      res.send('User not found');
    }
});

// //-- LOGIN
// app.post('/login', async (req, res) => {
//   const { email, password } = req.body;

//   //-- Filter user from the users array by username and password
//   const [[user]] = await global.db.query(
//       'SELECT * FROM users WHERE email=? AND password=?',
//       [email, password]);

//   if (user) {
//       console.log('user: ', user);
//       //-- Generate an access token
//       const token = jsonwebtoken.sign({ id: user.user_id, email: user.email },
//                                       JWT_KEY);
//       res.json({ jwt: token });
//   } else {
//     res.send('username or password incorrect');
//   }
// });


app.post('/register', async function(req, res) {
    bcrypt.genSalt(12, (err, salt) => {
      // if (err) {
      //   return console.log("Bcrypt genSalt error!");
      // }
      bcrypt.hash(req.body.password, salt, async (err, hash) => {
          // if (err) {
          //   return console.log("Bcrypt hash error!");
          // }
          //// Now we can store the password hash in db.
          console.log('Salt: ', salt);
          console.log('Hash: ', hash); 
          try {
              const { fname, lname, email, deleted_flag } = req.body;
              const [user] = await global.db.query(
                                              `INSERT INTO users(email, password)
                                                    VALUES(?, ?)`,
                                              [
                                                email,
                                                hash  
                                              ]
              );
              console.log(user.insertId);
              //-- Generate token (string)
              // console.log('Req.body: ', req.body);
              const token = jsonwebtoken.sign({id: user.insertId, email: req.body.email}, JWT_KEY);
              res.json(token);
          } catch (error) {
            console.log('Error adding user to the database!');
          }
      });
    });
    console.log('DONE');


    // bcrypt.hash(req.body.password, 12).then(async hash => {
    //     try {
    //       const { fname, lname, email, deleted_flag } = req.body;
    //       [user] = await global.db.query(
    //         `INSERT INTO users(email, password)
    //             VALUES(?, ?)`,
    //               [
    //                 email,
    //                 hash               
    //               ]
    //       );
    //       console.log('Password hash: ', hash);
    //     } catch(err) {
    //         console.log('/register ERROR', err);
    //     }
    // });
    // //-- Convert to a string
    // const encodedUser = jsonwebtoken.sign(req.body, JWT_KEY);
    // res.json(encodedUser);
  // } catch(err) {
  //   console.log('Bcrypt error: ', err);
  // }
});

// //-- REGISTER
// app.post('/register', async (req, res) => {
//   // const { email, password } = req.body;
//   const { email } = req.body;

//   console.log('Raw password: ', req.body.password);

//   const salt = genSaltSync(12);
//   const password = hash(req.body.password, salt);
//   console.log('Hashed password: ', password);
  
//   try {
//       const [resultsHeader] = await global.db.query(
//                 `INSERT INTO users (email, password) 
//                       VALUES (?, ?)`, 
//                 [
//                   email,
//                   password,
//                 ]
//       );

//       console.log(resultsHeader.insertId);
//       const token = jsonwebtoken.sign({id: insert.insertId, email: email},
//                                       JWT_KEY);
//       res.json({ jwt: token });
//   } catch (error) {
//       console.log(error);
//       res.send('Error registering new user!');
//   }
// });



//-- GET cars
app.get('/cars', authenticateJWT, async (req, res) => {
  //-- (req.user data was assigned in 'authenticateJWT' above) 
  const [data] = await global.db.query(`SELECT * FROM cars
                                            WHERE user_id=?`,
                                            [req.user.id]);
  res.send({data});
});

//-- DELETE Car
app.delete('/cars/:id', authenticateJWT, async (req, res) => {
  await global.db.query(`DELETE FROM cars WHERE id = ? AND user_id=?`,
                        [req.params.id, req.user.id]);
  res.send(`Car ID: ${req.params.id} has been deleted.`)
});

//-- POST Car
app.post('/cars', authenticateJWT, async (req, res) => {
  await global.db.query(`INSERT INTO cars ( make_id, 
                                            color, 
                                            user_id) 
                                    VALUES (?, ?, ?)`, 
                        [
                          req.body.make_id,
                          req.body.color,
                          req.user.id
                        ]
  );
  res.send('Car added!');
});

//-- GET Users
app.get('/users', authenticateJWT, async (req, res) => {
  //-- Display current user info.  (req.user was assigned in 'authenticateJWT' above)
  console.log('Current user: ', req.user);
  const [data] = await global.db.query(`SELECT * FROM users`);
  res.send({data});
});


app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
  });



// app.post('/register', async (req, res) => {
//   console.log('register.req.body', req.body);
//   const { user_id, email, password } = req.body;

//   try {
//       await global.db.query(`INSERT INTO users (user_id,
//                                                 email, 
//                                                 password) 
//                                         VALUES (?, ?, ?)`, 
//                             [
//                               user_id,
//                               email,
//                               password,
//                             ]
//       );
//       const token = jsonwebtoken.sign(req.body,
//                                 JWT_KEY);
//       res.json({ jwt: token });
//       //res.send('New user added to the database!'); 
//   } catch (error) {
//       console.log(error);
//       res.send('Error registering new user!');
//   }
// });


// app.get('/users/:id', async (req, res) => {
//   const [data] = await global.db.query(`SELECT * FROM users WHERE id = ?`, 
//                                         [req.params.id]);
//   res.send({data});
// });

// app.post('/users', async (req, res) => {
// await global.db.query(`INSERT INTO users (fname, 
//                                           lname, 
//                                           email, 
//                                           password, 
//                                           deleted_flag) 
//                             VALUES (?, ?, ?, ?, ?)`, 
//                                     [
//                                       req.body.fname,
//                                       req.body.lname,
//                                       req.body.email, 
//                                       req.body.password,
//                                       0 
//                                     ]
// );
// res.send('New user added to the database!')
// });

// app.put('/users', async (req, res) => {
// await global.db.query(`UPDATE users SET fname = ?, 
//                                         lname = ?,
//                                         email = ?,
//                                         password = ?,
//                                         deleted_flag = ?
//                               WHERE id = ?`, 
//                       [ 
//                         req.body.fname, 
//                         req.body.lname,
//                         req.body.email,
//                         req.body.password,
//                         req.body.deleted_flag,
//                         req.body.id
//                       ]
// );
// res.send(`User has been updated`);
// });

// app.delete('/users/:id', async (req, res) => {
// await global.db.query(`DELETE FROM users WHERE id = ?`,
//                       [req.params.id]);
// res.send(`User ID: ${req.params.id} has been deleted.`)
// });

// //-- POST new car data
// app.post('/cars', authenticateJWT, async (req, res) => {
//   console.log('User: ', req.user.user_id)
//   await global.db.query(`INSERT INTO cars ( make_id, 
//                                             color, 
//                                             user_id) 
//                                     VALUES (?, ?, ?)`, 
//                         [
//                           req.body.make_id,
//                           req.body.color,
//                           req.user.user_id
//                         ]
//   );
//   res.send('Car added!');
// });
