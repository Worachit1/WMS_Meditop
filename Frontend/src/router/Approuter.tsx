import { createBrowserRouter, RouterProvider } from "react-router-dom";

import UserPage from "../pages/master/UserPage";
import MainLayout from "../layouts/Mainloyout";
import Index from "../pages/index";
import DepartmentPage from "../pages/master/DepartmentPage";
import BuildingPage from "../pages/master/BuildingPage";
import ZoneTypePage from "../pages/master/ZoneTypePage";
import ZonePage from "../pages/master/ZonePage";
import LocationPage from "../pages/master/LocationPage";
import GoodPage from "../pages/master/GoodPage";
import BarcodePage from "../pages/master/BarcodePage";
import StockPage from "../pages/master/StockPage";
import StockCountPage from "../pages/stock_count/StockCountPage";
import Login from "../pages/auth/Login";
import PrivateRoute from "../components/PrivateRoute/PrivateRoute";
import InboundPage from "../pages/inbound/InboundPage";
import InboundById from "../features/inbound/components/InboundById";
import OutboundPage from "../pages/outbound/OutboundPage";
import BatchINV from "../features/outbound/components/batch/BatchINV";
import GroupOrder from "../features/outbound/components/groporder/GroupOrder";
import ScanBox from "../features/outbound/components/scanbox/ScanBox";
import Borrrow_StockPage from "../pages/borrow_stock/Borrrow_StockPage";
import AdjustmentPage from "../pages/adjustment/AdjustmentPage";
import ExpNcrPage from "../pages/transfer/ExpNcrPage";
import DetailTransferExpNcr from "../features/transfer-exp-ncr/components/DetailTransferExpNcr";
import PutTransferExpNcr from "../features/transfer-exp-ncr/components/PutTransferExpNcr";
import ViewDetailPut from "../features/transfer-exp-ncr/components/ViewDetailPut";
import MovementPage from "../pages/transfer/MovementPage";
import AddTransferMovement from "../features/transfer-movement/components/addtransfermovement/AddTransferMovement";
import DetailTransferMovement from "../features/transfer-movement/components/detailTransfermovement/DetailTransferMovement";
import DetailAdjust from "../features/adjustment/components/adjustdetail/DetailAdjust";
import AdjustManual from "../features/adjustment/components/adjustmanual/AdjustManual";
import EditTransferMovement from "../features/transfer-movement/components/edittransfermovement/EditTransferMovement";
import Report_StockPage from "../pages/report/Report_StockPage";
import Report_MovementPage from "../pages/report/Report_MovementPage";
import BorPage from "../pages/transfer/BorPage";
import AddBorrowStock from "../features/borrow_stock/components/addborrow_stock/AddBorrowStock";
import EditBorrowStockPage from "../features/borrow_stock/components/editbarrow_stock/EditBorrowStock";
import DetailBor from "../features/bor/components/DetailBor";
import ReportStockAllPage from "../pages/report/ReportStockAllPage";
// import DetailReportMovemnt from "../features/report_movement/components/DetailReportMovemnt";

const router = createBrowserRouter([
  {
    path: "/auth/login",
    element: <Login />,
  },

  {
    path: "/",
    element: (
      <PrivateRoute>
        <MainLayout />
      </PrivateRoute>
    ),
    children: [
      {
        path: "/",
        element: (
          <PrivateRoute>
            <Index />
          </PrivateRoute>
        ),
      },
      {
        path: "/user",
        element: (
          <PrivateRoute>
            <UserPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/department",
        element: (
          <PrivateRoute>
            <DepartmentPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/building",
        element: (
          <PrivateRoute>
            <BuildingPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/zone_type",
        element: (
          <PrivateRoute>
            <ZoneTypePage />
          </PrivateRoute>
        ),
      },
      {
        path: "/zone",
        element: (
          <PrivateRoute>
            <ZonePage />
          </PrivateRoute>
        ),
      },
      {
        path: "/location",
        element: (
          <PrivateRoute>
            <LocationPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/good",
        element: (
          <PrivateRoute>
            <GoodPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/barcode",
        element: (
          <PrivateRoute>
            <BarcodePage />
          </PrivateRoute>
        ),
      },
      {
        path: "/stock",
        element: (
          <PrivateRoute>
            <StockPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/stock_count",
        element: (
          <PrivateRoute>
            <StockCountPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/inbound",
        element: (
          <PrivateRoute>
            <InboundPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/inbound/:no",
        element: (
          <PrivateRoute>
            <InboundById />
          </PrivateRoute>
        ),
      },
      {
        path: "/outbound",
        element: (
          <PrivateRoute>
            <OutboundPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/batch-inv",
        element: (
          <PrivateRoute>
            <BatchINV />
          </PrivateRoute>
        ),
      },
      {
        path: "/group-order",
        element: (
          <PrivateRoute>
            <GroupOrder />
          </PrivateRoute>
        ),
      },
      {
        path: "/scan-box",
        element: (
          <PrivateRoute>
            <ScanBox />
          </PrivateRoute>
        ),
      },
      {
        path: "borrow_stock",
        element: (
          <PrivateRoute>
            <Borrrow_StockPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/borrow_stock/add",
        element: (
          <PrivateRoute>
            <AddBorrowStock />
          </PrivateRoute>
        ),
      },
      {
        path: "/borrow_stock/edit/:id",
        element: (
          <PrivateRoute>
            <EditBorrowStockPage />
          </PrivateRoute>
        ),
      },
      {
        path: "/borrow_stock/view/:id",
        element: (
          <PrivateRoute>
            <EditBorrowStockPage view />
          </PrivateRoute>
        ),
      },
      {
        path: "adjustment",
        element: (
          <PrivateRoute>
            <AdjustmentPage />
          </PrivateRoute>
        ),
      },
      {
        path: "adjustment/:id",
        element: (
          <PrivateRoute>
            <DetailAdjust />
          </PrivateRoute>
        ),
      },
      {
        path: "adjustment/:id/manual",
        element: (
          <PrivateRoute>
            <AdjustManual />
          </PrivateRoute>
        ),
      },
      {
        path: "tf-exp-ncr",
        element: (
          <PrivateRoute>
            <ExpNcrPage />
          </PrivateRoute>
        ),
      },
      {
        path: "tf-exp-ncr/:no",
        element: (
          <PrivateRoute>
            <DetailTransferExpNcr />
          </PrivateRoute>
        ),
      },
      {
        path: "tf-exp-ncr-put/:no",
        element: (
          <PrivateRoute>
            <PutTransferExpNcr />
          </PrivateRoute>
        ),
      },
      {
        path: "tf-exp-ncr-view/:no",
        element: (
          <PrivateRoute>
            <ViewDetailPut />
          </PrivateRoute>
        ),
      },
      {
        path: "tf-movement",
        element: (
          <PrivateRoute>
            <MovementPage />
          </PrivateRoute>
        ),
      },
      {
        path: "add-transfer-movement",
        element: (
          <PrivateRoute>
            <AddTransferMovement />
          </PrivateRoute>
        ),
      },
      {
        path: "detail-transfer-movement/:no",
        element: (
          <PrivateRoute>
            <DetailTransferMovement />
          </PrivateRoute>
        ),
      },
      {
        path: "edit-transfer-movement/:no",
        element: (
          <PrivateRoute>
            <EditTransferMovement />
          </PrivateRoute>
        ),
      },
      {
        path: "bor",
        element: (
          <PrivateRoute>
            <BorPage />
          </PrivateRoute>
        ),
      },
      {
        path: "bor/detail/:id",
        element: (
          <PrivateRoute>
            <DetailBor />
          </PrivateRoute>
        ),

      },
      {
        path: "report-stock",
        element: (
          <PrivateRoute>
            <Report_StockPage />
          </PrivateRoute>
        ),
      },
      {
        path: "report-movement",
        element: (
          <PrivateRoute>
            <Report_MovementPage />
          </PrivateRoute>
        ),
      },
      // {
      //   path: "report-movement/detail/:source/:id",
      //   element: (
      //     <PrivateRoute>
      //       <DetailReportMovemnt />
      //     </PrivateRoute>
      //   ),
      // },
      {
        path: "report-stock-all",
        element: (
          <PrivateRoute>
            <ReportStockAllPage />
          </PrivateRoute>
        ),
      },
    ],
  },
]);

function AppRouter() {
  return (
    <div className="App">
      <RouterProvider router={router} />
    </div>
  );
}

export default AppRouter;
