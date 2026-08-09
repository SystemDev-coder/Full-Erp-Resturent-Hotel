# 🎨 Somali NLP Research Platform - Premium SaaS Dashboard

A production-ready, modern SaaS dashboard interface for the Somali NLP Research Platform, built with React, TypeScript, Tailwind CSS, and Framer Motion.

## 🚀 Features

### Architecture & Design

- **Premium SaaS UI** inspired by ChatGPT, Hugging Face, Vercel, Linear, and Notion
- **Responsive Design** - Desktop, tablet, and mobile support
- **Dark/Light Mode** - Full theme support with persistent storage
- **Smooth Animations** - Framer Motion for polished transitions
- **Type-Safe** - Full TypeScript implementation
- **Modern Styling** - Tailwind CSS with custom color system

### Pages & Functionality

#### 🏠 Dashboard

- **Metric Cards** - Total predictions, accuracy, F1 score, active models
- **Charts** - Accuracy trend line chart and F1 score bar chart
- **Model Leaderboard** - Ranked models with performance metrics
- **Recent Activity** - Timeline of recent actions
- **Real-time Data** - Fetches from backend API

#### 🧠 Predict Page

- **Text Input** - Large Somali text area with character counter
- **Real-time Validation** - Max 5000 characters
- **Classification Results** - AI vs Human classification
- **Confidence Score** - Animated progress bars
- **Model Details** - Shows which model was used
- **Result Export** - Export options for predictions

#### 🚀 Models Page

- **Model Cards** - Beautiful grid layout with metrics
- **Best Model Badge** - Highlights recommended LinearSVC
- **Performance Metrics** - Accuracy and F1 score visualizations
- **Model Comparison Table** - Detailed comparison view
- **Status Indicators** - Active/Inactive status
- **Model Actions** - Use or reactivate models

#### 📊 Experiments Page

- **Experiment Table** - Searchable, sortable experiment list
- **Accuracy Comparison Chart** - Bar chart visualization
- **F1 Score Comparison** - Line chart trends
- **Export Functionality** - Download experiment results
- **Advanced Filtering** - Search and filter capabilities

#### 📤 Datasets Page

- **Drag & Drop Upload** - Intuitive file upload interface
- **File Preview** - Shows selected file details
- **Upload Progress** - Loading indicator during upload
- **Dataset List** - All uploaded datasets with metadata
- **Dataset Statistics** - Total files, size, and last upload date
- **File Management** - Preview and delete options

#### 🔐 Login Page

- **Professional Layout** - Centered authentication form
- **Gradient Background** - Modern aesthetic
- **Error/Success Messages** - User feedback
- **Form Validation** - Email and password validation
- **Auto-redirect** - Redirects to dashboard on successful login

### Components Library

#### UI Components

- **Button** - Multiple variants (primary, secondary, outline, ghost, danger)
- **Card** - Flexible card components with headers, content, footers
- **Input** - Text inputs with icons, labels, and error states
- **Badge** - Status badges with multiple variants
- **Layout** - Responsive sidebar + main content area

#### Layout Features

- **Collapsible Sidebar** - Mobile-friendly navigation
- **Top Navigation** - Sticky header with user menu
- **Breadcrumb Navigation** - Coming soon
- **Theme Switcher** - Dark/Light mode toggle
- **Responsive Design** - Works on all screen sizes

## 🛠️ Tech Stack

```
Frontend Framework: React 18
Language: TypeScript
Build Tool: Vite 4
Styling: Tailwind CSS
Animations: Framer Motion
Charts: Recharts
Icons: Lucide React
HTTP Client: Axios
Routing: React Router v6
State: React Context
```

## 📦 Dependencies

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-router-dom": "6.14.1",
    "axios": "1.4.0",
    "framer-motion": "^10.x",
    "recharts": "^2.10.x",
    "lucide-react": "^0.263.x"
  },
  "devDependencies": {
    "typescript": "5.2.2",
    "vite": "4.4.9",
    "@vitejs/plugin-react": "4.0.0"
  }
}
```

## 🎯 Color System

### Primary Colors

- **Primary**: Indigo/Sky Blue (`#0ea5e9`)
- **Accent**: Emerald Green (`#22c55e`)
- **Neutral**: Professional grays

### Semantic Colors

- **Success**: Green badges for active status
- **Warning**: Amber for warnings
- **Error**: Red for errors and destructive actions
- **Info**: Blue for information

## 🚀 Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
cd web/frontend
npm install
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5174/`

### Build

```bash
npm run build
```

Production build output goes to `dist/`

### Preview

```bash
npm run preview
```

## 📱 Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px
- **Large**: > 1280px

## 🔑 Key Features Implemented

### Authentication

- Login page with email/password
- Token-based authentication
- Persistent auth state
- Protected routes

### API Integration

- Backend API calls to `/api`, proxied by Vite to `http://localhost:8001`
- Axios instance with proper error handling
- Async data loading with loading states

### User Experience

- Skeleton loading states
- Error handling and display
- Success notifications
- Empty states
- Responsive interactions
- Smooth animations

### Performance

- Code splitting ready
- Optimized bundle size
- Lazy loading support
- Efficient re-renders with React.memo
- Proper dependency management

## 🎨 Theme System

The application uses a custom Tailwind theme with:

```js
colors: {
  primary: { 50-900 },    // Indigo/Blue
  accent: { 50-900 },     // Emerald
  neutral: { 50-900 }     // Grays
}
```

Dark mode is automatically applied based on system preference or user selection.

## 📊 Data Flow

```
User Input
    ↓
Component State
    ↓
API Call (Axios)
    ↓
Backend Response
    ↓
State Update
    ↓
UI Re-render
```

## 🔗 Backend Integration

All API calls point to `/api/` in development and are proxied to `http://localhost:8001/api/`

### Endpoints Used

- `GET /` - Fetch available models
- `POST /api/predict` - Make predictions
- `GET /api/datasets` - List datasets
- `POST /api/datasets/upload` - Upload dataset
- `GET /api/experiments` - List experiments
- `POST /api/auth/login` - User authentication

## 📋 File Structure

```
src/
├── pages/
│   ├── Dashboard.tsx        # Dashboard with charts
│   ├── Predict.tsx          # Prediction interface
│   ├── Models.tsx           # Models showcase
│   ├── Experiments.tsx       # Experiments comparison
│   ├── Datasets.tsx         # Dataset upload
│   └── Login.tsx            # Authentication
├── components/
│   ├── Layout.tsx           # Main layout wrapper
│   └── ui/
│       ├── Button.tsx       # Button component
│       ├── Card.tsx         # Card components
│       ├── Input.tsx        # Input component
│       └── Badge.tsx        # Badge component
├── contexts/
│   └── ThemeContext.tsx     # Theme management
├── App.tsx                  # Router setup
├── main.tsx                 # Entry point
└── index.css                # Tailwind & global styles
```

## 🎯 Design Inspirations

- **ChatGPT**: Clean interface, smooth animations
- **Hugging Face**: Modern gradient designs
- **Vercel**: Minimalist aesthetic
- **Linear**: Professional data tables
- **GitHub**: Consistent component library
- **Notion**: Flexible layouts

## ✨ Styling Approach

- **Utility-First**: Tailwind CSS
- **Component Variants**: Custom button/card variants
- **Dark Mode**: Class-based theme switching
- **Custom Shadows**: Elevated card effects
- **Smooth Transitions**: 200ms duration by default

## 🔐 Security

- Token stored in localStorage
- Protected routes with authentication check
- CORS-enabled backend communication
- Input validation on forms

## 🚀 Performance Optimizations

- Code splitting with React lazy loading
- Efficient re-renders with proper deps arrays
- Memoized components for heavy sections
- Optimized images and assets
- Production build minification

## 📚 Component Examples

### Button Usage

```tsx
<Button variant="primary" size="lg" isLoading={loading} icon={<SendIcon />}>
  Submit
</Button>
```

### Card Usage

```tsx
<Card>
  <CardHeader>
    <h3>Title</h3>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Theme Toggle

```tsx
const { theme, toggleTheme } = useTheme()
<button onClick={toggleTheme}>
  {theme === 'light' ? '🌙' : '☀️'}
</button>
```

## 🐛 Known Issues & Future Improvements

- [ ] Add more chart types (pie, scatter)
- [ ] Implement data pagination
- [ ] Add data export (CSV, PDF)
- [ ] Advanced filtering system
- [ ] Real-time notifications
- [ ] User profile customization
- [ ] Model versioning
- [ ] Batch predictions

## 📄 License

This project is part of the Somali NLP Research Platform.

## 🤝 Contributing

Guidelines coming soon.

---

**Built with ❤️ for the Somali NLP Research Platform**

For backend documentation, see `/web/backend/README.md`
