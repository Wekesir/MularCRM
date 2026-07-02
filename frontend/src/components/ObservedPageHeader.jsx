import { useEffect, useRef } from 'react';
import PageHeaderCard from './PageHeaderCard';
import { usePageHeaderSticky } from '../context/PageHeaderStickyContext';

function ObservedPageHeader(props) {
  const ref = useRef(null);
  const { setPageHeaderInView } = usePageHeaderSticky();

  useEffect(() => {
    const scrollRoot = document.querySelector('.main-content');
    const headerEl = ref.current;
    if (!scrollRoot || !headerEl) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setPageHeaderInView(entry.isIntersecting);
      },
      { root: scrollRoot, threshold: 0 },
    );

    observer.observe(headerEl);
    return () => observer.disconnect();
  }, [setPageHeaderInView]);

  return (
    <div ref={ref} className="page-header-observer">
      <PageHeaderCard {...props} />
    </div>
  );
}

export default ObservedPageHeader;
