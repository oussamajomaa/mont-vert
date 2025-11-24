import express from 'express'
import cors from 'cors'
import authRoutes from './auth/auth.routes.js'
import productRoutes from './routes/product.routes.js'
import lotRoutes from './routes/lot.routes.js'
import recipeRoutes from './routes/recipe.routes.js'
import mealplanRoutes from './routes/mealplan.routes.js'
import movementRoutes from './routes/movement.routes.js'
import stockRoutes from './routes/stock.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/user.routes.js';
import cookieParser from 'cookie-parser'


const app = express()
app.use(cookieParser())
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json())

app.use('/auth', authRoutes)
app.use('/products', productRoutes)
app.use('/lots', lotRoutes)
app.use('/recipes', recipeRoutes)
app.use('/meal-plans', mealplanRoutes)
app.use('/movements', movementRoutes)
app.use('/stock', stockRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/users', userRoutes);

app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Server error' })
})

// export default app
const port = process.env.PORT || 4000
app.listen(port, () => console.log(`API running on :${port}`))