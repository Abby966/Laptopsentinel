import express from 'express';
import http from 'http';
import path from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';

import adminRoutes from './routes/admin.js';
import studentRoutes from './routes/student.js';
import guardRoutes from './routes/guard.js';

import { queryAll, queryDB } from './config/db/db.js'; 
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const app = express();
const port = 3001;
const server = http.createServer(app);
const io = new Server(server);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/admin', adminRoutes);
app.use('/student', studentRoutes);
app.use('/guard', guardRoutes);
app.set('view engine', 'ejs');

let insert_query;
let insert_values;

app.get('/', (req, res) => res.render('login'));

app.get('/logout',(req, res)=>{
    res.redirect('/')
})


app.post('/login', async(req, res) => {
    let { userId, password } = req.body;
    userId =  userId.toLowerCase().trim()
    password = password.trim()  
    if (userId.startsWith("adm/")) {

        insert_query = `SELECT user_name, password
                      FROM admin
                      WHERE user_name = $1  `
        insert_values = [userId]

        try{
            let adminData = await queryDB(insert_query, insert_values)
            if (userId === adminData.user_name && password === adminData.password) {
                return res.json({ role: 'admin' });
            }
        }catch(error){
            res.status(401).json({ error: 'Interval server error try again!' });
        }
        
    } else if (userId.startsWith('ugr/')) {

        insert_query = `SELECT id, password 
                      FROM students WHERE
                      id = $1  `
        insert_values = [userId]
        try{

            let student = await queryDB(insert_query, insert_values)
            if (student && student.password === password) {
                return res.json({ role: 'student', id: student.id });
            }
        }catch(error){
            return res.status(401).json({ error: 'Interval server error try again!' });
        }


    } else if (userId.startsWith('sfg/')) {
        try{
            insert_query = `SELECT guard_id, password 
                        FROM guards WHERE
                        guard_id = $1  `
            insert_values = [userId]
            let guard = await queryDB(insert_query, insert_values)
            if (guard &&  guard.password === password) {
                return res.json({ role: 'guard', id:guard.guard_id });
            }
        }catch(error){
           return res.status(401).json({ error: 'Interval server error try again!' });
        }
    }
    
    res.status(401).json({ error: 'Invalid username or password' });

});




app.post('/reportStolenPc', upload.single('pc-image'), async (req, res) => {
    try {
      // Log incoming request body and file
      console.log("Received request body:", req.body);
      console.log("Received file:", req.file);
  
      let { pc_serial, pc_model, pc_brand, student_id } = req.body;
      pc_serial = pc_serial.toLowerCase().trim();
      console.log("Processed PC Serial:", pc_serial);
  
      // Check if the PC exists for the user
      const checkPcQuery = `SELECT * FROM pcs WHERE user_id = $1 AND serial = $2`;
      const checkPcValues = [student_id, pc_serial];
      console.log("Executing query:", checkPcQuery, "with values:", checkPcValues);
  
      const result = await queryDB(checkPcQuery, checkPcValues);
  
      if (result) {
        console.log("PC found for the user:", result);
  
        // Check if the PC has already been reported
        const checkLostQuery = `SELECT pc_serial FROM lostpcs WHERE pc_serial = $1`;
        const checkLostValues = [pc_serial];
        console.log("Executing query:", checkLostQuery, "with values:", checkLostValues);
  
        const wasReported = await queryDB(checkLostQuery, checkLostValues);
        if (wasReported) {
          console.log("PC was already reported:", wasReported);
          return res.status(400).json({ error: "The PC was reported before" });
        } else {
          console.log("PC is not reported yet, proceeding to report.");
  
          let reportedDate = new Date();
          reportedDate = reportedDate.toISOString().split('T')[0];
          console.log("Generated reported date:", reportedDate);
  
          const reportPcQuery = `INSERT INTO lostpcs (pc_serial, reported_date) VALUES ($1, $2)`;
          const reportPcValues = [pc_serial, reportedDate];
          console.log("Executing query:", reportPcQuery, "with values:", reportPcValues);
  
          await queryDB(reportPcQuery, reportPcValues);
  
          const pcData = {
            pcSerial: result.serial,
            pcModel: result.model,
            pcBrand: result.brand,
            studentId: result.user_id,
            pcImage: result.pic_url.split("\\public")[1],
            reportedDate: reportedDate,
          };
  
          console.log("Emitting socket event with data:", pcData);
          io.emit('stolenPCReported', pcData);
  
          return res.send({ message: 'Report received' });
        }
      } else {
        console.log("No PC found for the provided user ID and serial.");
        return res.status(409).json({ error: 'The PC was not registered before.' });
      }
    } catch (error) {
      console.error("Error occurred in /reportStolenPc route:", error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  

server.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});


