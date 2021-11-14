const express = require('express');
const jsonwebtoken = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const app = express();

require('dotenv').config();
const port = process.env.PORT;
const JWT_KEY = process.env.JWT_KEY;

//-- Middleware
app.use(express.json());

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    console.log('authHeader: ', authHeader);

    if (authHeader) {
        //-- Get the token from the Authorization header (with the "Bearer" removed)
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
    console.log("LOGGING IN");
    const { email, password } = req.body;
    console.log(email, password);

    //-- Filter user from the users array by username and password
    const [[user]] = await global.db.query(
                                  'SELECT * FROM Users WHERE email=?',
                                  [email]
    );
    if (user) {
      console.log("Got user info: ", user);
      bcrypt.compare(password, user.password, function(err, compareResult) {
        console.log(compareResult);
        if (compareResult == true) {
          console.log("Password matched");
          //-- Generate an access token
          console.log('idUser: ', user.idUser);
          console.log('email: ', user.email);
          const token = jsonwebtoken.sign({ id: user.idUser, email: user.email },
            JWT_KEY);
            console.log('token: ', token);
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


app.post('/register', async function(req, res) {
    // Generate salt
    bcrypt.genSalt(12, (err, salt) => {
      // Hash password
      bcrypt.hash(req.body.password, salt, async (err, hash) => {
          console.log('Salt: ', salt);
          console.log('Hash: ', hash); 
          try {
              const { fName, lName, email, deletedFlag } = req.body;
              const [user] = await global.db.query(
                                              `INSERT INTO Users(fName, lName, email, password, deletedFlag)
                                                    VALUES(?, ?, ?, ?, ?)`,
                                              [
                                                fName,
                                                lName,
                                                email,
                                                hash ,
                                                deletedFlag 
                                              ]
              );
              console.log(user.insertId);
              //-- Generate token (string)
              const token = jsonwebtoken.sign({id: user.insertId, email: req.body.email}, JWT_KEY);
              res.json(token);
          } catch (error) {
            console.log(error);
            console.log('Error adding user to the database!');
          }
      });
    });
});


//-- GET Products
app.get('/product', async (req, res) => {
  const [data] = await global.db.query(`SELECT p.idProduct, p.pName, p.pDescription, b.brandName 
                                            FROM ProductsDB.Product p
                                            LEFT JOIN Brand b ON p.idBrand=b.idBrand`);
  res.send({data});
});

//-- GET Brands
app.get('/brand', async (req, res) => {
  const { idBrand } = req.body;
  console.log('idBrand: ', idBrand);
  const [data] = await global.db.query(`SELECT p.idProduct, p.pName, p.pDescription, b.brandName 
                                            FROM ProductsDB.Product p
                                            LEFT JOIN Brand b ON p.idBrand=b.idBrand
                                            WHERE p.idBrand=?`,
                                            [idBrand]);
  res.send({data});
});

//-- GET Category
app.get('/category', async (req, res) => {
  // const { idCategory } = req.body;
  console.log('idCategory: ', idCategory);
  const [data] = await global.db.query(`SELECT p.idProduct, p.pName, p.pDescription, c.nameCategory 
                                            FROM ProductsDB.Product p
                                            LEFT JOIN Category c ON p.idCategory=c.idCategory
                                            WHERE p.idCategory=?`,
                                            [idCategory]);
  res.send({data});
});

//-- GET Favorites
app.get('/favorites', authenticateJWT, async (req, res) => {
  const user = req.user;
  console.log('idUser: ', user);
  const [data] = await global.db.query(`SELECT p.idProduct, p.pName, p.pDescription, fav.idUser, fav.Notes 
                                            FROM ProductsDB.Product p
                                            LEFT JOIN Favorites fav ON p.idProduct=fav.idProduct
                                            WHERE fav.idUser=?`,
                                            [user.id]);
  res.send({data});
});

//-- DELETE Favorites
app.delete('/favorites', authenticateJWT, async (req, res) => {
  const user = req.user;
  const { idProduct } = req.body;
  console.log('idUser: ', user);
  console.log('idProduct: ', idProduct);
  const [data] = await global.db.query(`DELETE FROM Favorites WHERE idUser=? AND idProduct=?`,
                                        [user.id, idProduct]);
  res.send({message: "Fav deleted!"});
});

//-- ADD a Favorite
app.post('/favorites', authenticateJWT, async function(req, res) {
    const user = req.user;
    console.log("User: ", user);
    const { idProduct, Notes } = req.body;
    await global.db.query(`INSERT INTO Favorites(idUser, idProduct, Notes)
                                          VALUES(?, ?, ?)`,
                                    [
                                      user.id,
                                      idProduct,
                                      Notes
                                    ]
    );
    res.send( {message: "Favorite added!"});
});

//-- UPDATE a Favorite
app.put('/favorites', authenticateJWT, async function(req, res) {
    const user = req.user;
    console.log("User: ", user);
    const { idProduct, Notes } = req.body;
    await global.db.query(`UPDATE Favorites SET Notes = ?
                                  WHERE idUser=? AND idProduct=?`, 
                                  [ 
                                    Notes, 
                                    user.id,
                                    idProduct,
                                  ]
    );
    res.send( {message: "Favorite item has been updated!"} );
});


//-- Listen on PORT
app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`)
  });
