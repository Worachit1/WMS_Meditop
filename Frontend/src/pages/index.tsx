import { Link } from 'react-router-dom'
import './index.css'

const Index = () => {
  const masterItems = [
    {icon: "fa-solid fa-user", title: "User", link: "/user"},
    {icon: "fa-solid fa-user-tie", title: "Department", link: "/department"},
    {icon: "fa-solid fa-building", title: "Building", link: "/building"},
    {icon: "fa-solid fa-temperature-high", title: "Zone Temp", link: "/zone_type"},
    {icon: "fa-solid fa-warehouse", title: "Zone", link: "/zone"},
    {icon: "fa-solid fa-map-marker-alt", title: "Location", link: "/location"},
    {icon: "fa-solid fa-box", title: "Product", link: "/good"},
    {icon: "fa-solid fa-barcode", title: "Barcode", link: "/barcode"},
    {icon: "fa-solid fa-clipboard-list", title: "Stock", link: "/stock"},
  ];

  return (
    <div className="index-container">
      <h1 className="index-title">Main Menu</h1>
      <hr className="underline-main-menu" />
      <div className="master-grid">
        {masterItems.map((item, index) => (
          <Link key={index} to={item.link} className="master-card">
            <div className="card-icon">
              <i className={`fa ${item.icon}`}></i>
            </div>
            <div className="master-title">{item.title}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Index;
