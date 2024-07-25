const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

// ... existing GET route remains the same ...

app.post('/api/submit-form', async (req, res) => {
  const { fields, formData } = req.body;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Insert form configuration
    const formConfigQuery = 'INSERT INTO form_configurations (name) VALUES ($1) RETURNING id';
    const formConfigResult = await client.query(formConfigQuery, ['New Form']);
    const formId = formConfigResult.rows[0].id;

    console.log('Form configuration created with ID:', formId);

    // Insert form fields and store their IDs
    const fieldIds = {};
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const fieldQuery = 'INSERT INTO form_fields (form_id, field_type, label, field_order) VALUES ($1, $2, $3, $4) RETURNING id';
      const fieldResult = await client.query(fieldQuery, [formId, field.type, field.label, i]);
      fieldIds[field.id] = fieldResult.rows[0].id;
      console.log('Field created:', field.label, 'with ID:', fieldResult.rows[0].id);
    }

    // Insert form submission
    const submissionQuery = 'INSERT INTO form_submissions (form_id) VALUES ($1) RETURNING id';
    const submissionResult = await client.query(submissionQuery, [formId]);
    const submissionId = submissionResult.rows[0].id;

    console.log('Form submission created with ID:', submissionId);

    // Insert submission values using the correct field IDs
    for (const [clientFieldId, value] of Object.entries(formData)) {
      const dbFieldId = fieldIds[clientFieldId];
      if (dbFieldId) {
        const valueQuery = 'INSERT INTO submission_values (submission_id, field_id, value) VALUES ($1, $2, $3)';
        await client.query(valueQuery, [submissionId, dbFieldId, value.toString()]);
        console.log('Submission value inserted for field:', clientFieldId, 'DB field ID:', dbFieldId);
      } else {
        console.warn('No matching DB field ID found for client field ID:', clientFieldId);
      }
    }

    await client.query('COMMIT');
    
    res.status(200).json({ message: 'Form configuration and data saved successfully', formId, submissionId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving form configuration and data:', error);
    res.status(500).json({ message: 'Failed to save form configuration and data', error: error.message, stack: error.stack });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));