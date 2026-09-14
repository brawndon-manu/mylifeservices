import Image from "next/image";
import Link from "next/link";
import styles from "./PortalBrand.module.css";

export default function PortalBrand() {
  return (
    <Link href="/portal" className={styles.brand}>
      <Image src="/logo/treelogov2.png" alt="" width={2428} height={1820} sizes="46px" preload className={styles.logo} />
      <span>
        <span className={styles.name}>My Life Services</span>
        <span className={styles.subtitle}>Employee portal</span>
      </span>
    </Link>
  );
}
